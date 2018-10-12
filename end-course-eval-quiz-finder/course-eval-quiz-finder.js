/********************************************************************************************
 * Description: 
 * This tool is to find the topic in each course that has the old 'End of Course Evaluation'
 * link and replace it with the new one proveded in the PUT object, as seen below. 
 * 
 * The process is as follows:
 * Get the Course's TOC
 * Traverse through it and create an array of all the topics in the course
 * Find the topic that has the old url, if there is one
 * PUT the topic to Brightspace with the new URL, the old name, and the TopicId
 * 
 * To run: You must upload this file to a Brightspace course. Upon opening the file in 
 * Brightspace, it will run. I (Seth Childers) created a module item, titled 'test', in a new 
 * module named 'api test' in my Brightspace Sandbox to run this tool. As I wrote the tool, 
 * I created a mapped network drive to the file in Brightspace from my local computer, so as
 * to avoid having to re-upload the file to Brightspace every time I modified the code.
 ********************************************************************************************/

/********************************************************************
 * Get the contents of the file input
 ********************************************************************/
function getCourses() {
    return new Promise((resolve, reject) => {
        var csvInput = document.getElementsByClassName('csvInput')[0];
        var csvDisplay = document.getElementsByClassName('csvDisplay')[0];
        var file = csvInput.files[0];
        var textType = /application\/vnd.ms-excel|text.*/;

        if (file.type.match(textType)) {
            var reader = new FileReader();
            var fileContents = '';
            var courses = [];
            var csvArray = [];
            reader.onload = () => {
                fileContents = reader.result;
                csvDisplay.innerText = fileContents;
                /* Use d3.dsv to turn the CSV file into an array of objects */
                csvArray = d3.csvParse(fileContents);
                /* Retrieve the courses' ids and names from the CSV */
                courses = csvArray.map(csv => {
                    return {
                        id: csv.id, // expecting an id column in the CSV
                        name: csv.name // expecting a name column in the CSV
                    }
                });
                /* Return the courses that were retrieved */
                resolve(courses);
            }
            reader.readAsText(file);
        } else {
            csvDisplay.innerText = "File not supported!"
            reject(new Error('Wrong File Type'));
        }
    });
}

/******************************************************************************************
 * This function will act as main for this program, as follows: 
 * 
 * 		Get the table of contents/ all the modules
 * 		Get a flat array of the topics in the course from the table of contents
 * 		Find the topic that has the old link
 * 		If the old link exists in the course, then PUT the topic
 * 		Log the results
 ******************************************************************************************/
function runCourse(course) {
    return new Promise(async (resolve, reject) => {
        var error = {};
        var quizzes = await getCourseQuizzes(course.id).catch(err => {
            error.getCourseQuizzes = err;
            console.error(err);
        });

        var returnObjs = quizzes.map(quiz => {
            return {
                'Course Name': course.name,
                'Course ID': course.id,
                'Quiz Title': quiz.Name,
                'Link to Quiz': `https://pathway.brightspace.com/d2l/lms/quizzing/admin/modify/quiz_newedit_properties.d2l?qi=${quiz.QuizId}&ou=${course.id}`,
                'Quiz is Active': quiz.IsActive,
                'Errors': Object.keys(error).length > 0 ? JSON.stringify(error) : ''
            }
        });
        /* Return the log info */
        resolve(returnObjs);
    });
}

function makeApiCall(url) {
    return new Promise((resolve, reject) => {
        var $ = window.top.jQuery;
        $.ajax({
            dataType: "json",
            url: url,
            success: resolve,
            method: 'GET',
            error: reject
        });
    });
}
/*********************************************
 * Get the modules and topics in the course
 * from the course's Table of Contents (TOC)
 * 
 * Returns the TOC object
 *********************************************/
function getCourseQuizzes(courseID) {
    return new Promise(async (resolve, reject) => {
        console.log(`Getting the courses quizzes with ID: ${courseID}`);
        var $ = window.top.jQuery;
        var url = `/d2l/api/le/1.28/${courseID}/quizzes/`;
        var quizzes = [];
        try {
            do {
                var returnedQuizzes = await makeApiCall(url);
                url = returnedQuizzes.Next;
                quizzes = quizzes.concat(returnedQuizzes.Objects);
            } while (url)
            console.log(quizzes);
            resolve(quizzes);
        } catch (e) {
            reject(e);
        }
    });
}

/*******************************************************
 * This function will loop through the array of courses
 *******************************************************/
async function runAllCourses() {
    try {
        /* Get an object array of all the courses' OUs and their names */
        const courses = await getCourses().catch(err => console.error(err));

        /* A log of all the course IDs, their old urls, and their new urls to be put into the CSV */
        var data = [];

        /* Loop through and do the following for each course */
        for (var i = 0; i < courses.length; i++) {
            var logInfo = await runCourse(courses[i]);
            data = data.concat(logInfo);
        }

        /* Format and create the CSV file with the log data */
        var csvData = d3.csvFormat(data, ["Course Name", "Course ID", "Quiz Title", "Link to Quiz", "Quiz is Active", "Errors"]);

        /* Log the csv, and download it */
        download(csvData, 'd2lReferenceCourses.csv');
    } catch (e) {
        console.error(e.stack);
    }
}


/*********************************
 * Start Here ^
 *********************************/
function setupTool() {
    runAllCourses();
}