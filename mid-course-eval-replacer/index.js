const puppeteer = require('puppeteer');
const fs = require('fs');
const d3 = require('d3-dsv');
const Logger = require('logger');
const logger = new Logger(`Pathway_Mid_Course_Evaluations_Verification_Report-${Date()}`);

async function login(userInput) {
    try {
        // Viewport && Window size
        const width = 1200
        const height = 1000

        const chrome = {
            x: 0,
            y: 74
        }; // comes from config in reality
        let args = [];
        args.push(`--window-size=${width+chrome.x},${height+chrome.y}`);
        // Using puppeteer, login to Brightspace
        const browser = await puppeteer.launch({
            slowMo: 200,
            args,
            headless: false, // change to true for production
            devtools: true
        });


        // make a new page and go to the login page
        const page = await browser.newPage();
        page.setViewport({
            width,
            height
        });
        await page.goto(`https://${userInput.domain}.brightspace.com/d2l/login?noredirect=1`);

        // select the username input field and fill it out with the input from cli.js
        const userNameInput = await page.$('input#userName');
        await userNameInput.type(userInput.username);

        // select the password input field and fill it out with the input from cli.js
        const passwordInput = await page.$('input#password');
        await passwordInput.type(userInput.password);

        // prep the page for navigation, then press "Enter" instead of looking for the button to login    
        await Promise.all([
            page.waitForRequest(`https://${userInput.domain}.brightspace.com/d2l/home`),
            passwordInput.press('Enter')
        ]);

        getCourseLinks(userInput.path, page, browser, userInput.verify);
    } catch (e) {
        console.error(e);
    }
}

async function getCourseLinks(filepath, page, browser, verify) {
    // read the file and get the row with the links to the quizzes
    let content = fs.readFileSync(filepath, 'utf8');
    let courses = d3.csvParseRows(content, (row, i) => {
        return {
            courseName: row[0],
            courseId: row[1],
            evaluationFound: row[3],
            link: row[2],
        }
    });

    // Remove the header that came from the csv file
    courses.shift();

    // Sort the links into their arrays
    let coursesWithoutEvals = [];
    let coursesWithEvals = [];
    courses.forEach(course => {
        if (course.link === '') {
            coursesWithoutEvals.push(course);
        } else {
            coursesWithEvals.push(course);
        }
    });

    // put the courses whose evaluations weren't found into the log here
    coursesWithoutEvals.forEach(course => {
        logger.log(`Courses who's evaluations weren't found`, course);
    });
    // either edit, or verify. One option, so you'll have to run it all twice
    if (verify === 'false') {
        editCourses(coursesWithEvals, page, browser);
    } else {
        verifyCourses(coursesWithEvals, page, browser);
    }
}

async function editCourses(coursesWithEvals, page, browser) {

    for (i = 0; i < coursesWithEvals.length; i++) {
        try {
            // got to the quiz setup page and wait for the header message section to load
            await page.goto(coursesWithEvals[i].link);
            await page.waitFor('#headerMessage iframe');

            page.once('pageerror', (e) => console.log(e));

            // set the new contents of the header
            const newText = `<p><span style="font-size: 1.3em;" data-mce-style="font-size: 1.3em;"> <strong>First</strong>, complete and submit the <a rel="noopener" href=" https://byui.az1.qualtrics.com/jfe/form/SV_3OhOwOdOWSj0K8d?CN={OrgUnitName}&amp;IE=null&amp;CID={OrgUnitId}&amp;ITID=D2L&amp;ITN=Mid-Semester Instructor Feedback" target="_blank" data-mce-href=" https://byui.az1.qualtrics.com/jfe/form/SV_3OhOwOdOWSj0K8d?CN={OrgUnitName}&amp;IE=null&amp;CID={OrgUnitId}&amp;ITID=D2L&amp;ITN=Mid-Semester Instructor Feedback"><strong>Mid-Semester Instructor Feedback Survey</strong></a> (will open in a new window)</span></p><p><span style="font-size: 1.3em;" data-mce-style="font-size: 1.3em;"> <strong>Second</strong>, indicate whether or not you provided your feedback by using the link above (so you can receive credit if your course provides points for submitting survey feedback). Then click 'Go To Submit Quiz' to complete this activity.</span></p>`;

            // Change the title
            let newTitle = await page.evaluate(() => {
                return Promise.resolve(document.querySelector('table[role="presentation"] input').value = 'Mid-Semester Instructor Feedback');
            });

            // add the new title to the course object for the log
            coursesWithEvals[i].newTitle = newTitle;

            // wait for the title to be set before moving on
            await page.waitForFunction(() => {
                // grab the contents from the console.log and ensure they are the same
                // console.log(document.querySelector('table[role="presentation"] input').value)
                return document.querySelector('table[role="presentation"] input').value === 'Mid-Semester Instructor Feedback';
            }, {
                polling: 250
            });

            // essentially, move the page view down to where the header will be changed just so it can be visible when changing it
            await page.tap('#headerMessage iframe');

            // set the new header text
            // must pass in newText as a parameter, it being in a new environment for this function (i.e. in the DOM)
            await page.evaluate((newText) => {
                return Promise.resolve(tinyMCE.get('headerMessage$html').setContent(newText));
            }, newText);

            // wait for the new header text to be set before moving on
            await page.waitForFunction((newText) => {
                // grab the contents from the console.log and ensure they are the same
                // console.log(document.querySelector('#headerMessage iframe').contentDocument.querySelector('#tinymce').innerHTML, newText)
                return document.querySelector('#headerMessage iframe').contentDocument.querySelector('#tinymce').innerHTML === newText;
            }, {
                polling: 250
            }, newText);

            // just a safety measure, wait two more seconds before moving on to make sure the header text was set
            await page.waitFor(2000);

            // prep the page for navigation, then click the "Save and Close" button
            await Promise.all([
                page.waitForNavigation(),
                page.click('button.d2l-button[primary="primary"')
            ]);

            // log that the course was completed
            logger.log('Courses that worked', coursesWithEvals[i]);
        } catch (e) {
            // log that the course wasn't completed
            logger.log(`Courses that didn't work`, coursesWithEvals[i]);
            console.error(e);
        }
    }
    // after running through all the courses, close the browser
    await browser.close();

    logger.htmlReport('./reports/html-reports');
    logger.jsonReport('./reports/json-reports');
}

async function verifyCourses(coursesWithEvals, page, browser) {

    for (i = 0; i < coursesWithEvals.length; i++) {
        try {
            // got to the quiz setup page and wait for the header message section to load
            await page.goto(coursesWithEvals[i].link);
            await page.waitFor('#headerMessage iframe');

            page.once('pageerror', (e) => console.log(e));

            // set the new contents of the header
            const verificationText = `<p><span style="font-size: 1.3em;"> <strong>First</strong>, complete and submit the <a rel="noopener" href="https://byui.az1.qualtrics.com/jfe/form/SV_3OhOwOdOWSj0K8d?CN={OrgUnitName}&amp;IE=null&amp;CID={OrgUnitId}&amp;ITID=D2L&amp;ITN=Mid-Semester Instructor Feedback" target="_blank"><strong>Mid-Semester Instructor Feedback Survey</strong></a> (will open in a new window)</span></p>
<p><span style="font-size: 1.3em;"> <strong>Second</strong>, indicate whether or not you provided your feedback by using the link above (so you can receive credit if your course provides points for submitting survey feedback). Then click 'Go To Submit Quiz' to complete this activity.</span></p>`;

            // Change the title
            let newTitle = await page.evaluate(() => {
                return Promise.resolve(document.querySelector('table[role="presentation"] input').value === 'Mid-Semester Instructor Feedback');
            });

            // add the new title to the course object for the log
            coursesWithEvals[i].newTitleInsertedCorrectly = newTitle;

            // essentially, move the page view down to where the header will be changed just so it can be visible when changing it
            await page.tap('#headerMessage iframe');

            // set the new header text
            // must pass in newText as a parameter, it being in a new environment for this function (i.e. in the DOM)
            let newHeader = await page.evaluate((verificationText) => {
                console.log(tinyMCE.get('headerMessage$html').getContent(), verificationText);
                return Promise.resolve(tinyMCE.get('headerMessage$html').getContent() === verificationText);
            }, verificationText);

            coursesWithEvals[i].newHeaderInsertedCorrectly = newHeader;

            // log that the course was completed
            if (coursesWithEvals[i].newHeaderInsertedCorrectly === true && coursesWithEvals[i].newTitleInsertedCorrectly === true) {
                logger.log('Courses that worked', coursesWithEvals[i]);
            } else {
                logger.log(`Courses that didn't work`, coursesWithEvals[i]);
            }
        } catch (e) {
            // log that the course wasn't completed
            logger.log(`Courses that erred`, coursesWithEvals[i]);
            console.error(e);
        }
    }
    // after running through all the courses, close the browser
    await browser.close();

    logger.htmlReport('./reports/html-reports');
    logger.jsonReport('./reports/json-reports');
}

module.exports = {
    login
}