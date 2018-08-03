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
        var tableOfContents = await getCourseTOC(course.id).catch(err => {
            error.getCourseTOC = err;
            console.error(err);
        });
        console.log(tableOfContents);
        var topics = getTopics(tableOfContents);

        // check if there are more than one
        var found = topics.filter(topic => {
            // console.log(topic.TypeIdentifier, /mid-?\s?course\s*eval(uation)?/gi.test(topic.Title));
            return topic.TypeIdentifier === 'Link' && /mid-?\s?course\s*eval(uation)?/gi.test(topic.Title);
        });

        // throw an error if there is more than one mid-course eval
        if (found.length > 1) {
            error.numMatches = `This course has ${found.length} matchs for 'Mid-Course Evaluation'.`;
            console.error(error.numMatches);
        }

        /* Return the log info */
        resolve({
            'Course Name': course.name,
            'Course ID': course.id,
            'Link to Evaluation': found.length > 0 ? `https://byui.brightspace.com${found[0].Url}` : '',
            'Evaluation Found': found.length > 0 ? 'Found' : 'Not Found',
            'Errors': Object.keys(error).length > 0 ? JSON.stringify(error) : ''
        });
    });
}

/*********************************************
 * Get the modules and topics in the course
 * from the course's Table of Contents (TOC)
 * 
 * Returns the TOC object
 *********************************************/
function getCourseTOC(courseID) {
    return new Promise((resolve, reject) => {
        var $ = window.top.jQuery;

        $.ajax({
            dataType: "json",
            url: `/d2l/api/le/1.24/${courseID}/content/toc`,
            success: resolve,
            method: 'GET',
            error: reject
        });
    });
}

/*********************************************
 * Iterate through the TOC and create a flat
 * array of all the topics in the course.
 * 
 * Returns the flattened object array of topics
 *********************************************/
function getTopics(tableOfContents) {
    var topics = [];

    /********************************************************************************
     * A recursive function that will iterate through the TOC tree and push 
     * all the leaf nodes (Topics, not empty Modules) onto a 'topics' array
     * 
     * If there are submodules in a module, then this function will be called 
     * recursively and take the current module's 'Modules' array as its parameters
     * ******************************************************************************/
    function recurseTOC(modules) {
        /* If modules is empty or undefined, return */
        if (!modules) {
            return;
        }

        /* If there are submodules, push their topics onto the topics array and iterate through their modules recursively */
        modules.forEach(mod => {
            /* First add whatever topics are in the module */
            if (mod.Topics && mod.Topics.length !== 0) {
                topics.push(mod.Topics);
            }
            /* Then if there are submodules, recurse through them */
            if (mod.Modules && mod.Modules.length !== 0) {
                recurseTOC(mod.Modules);
            }
        });
    }

    /* Call the function once. If it has submodules, it will be called recursively */
    recurseTOC(tableOfContents.Modules);

    /* Return a flattened array of topics */
    return topics.reduce((acc, currArray) => acc.concat(currArray), []);
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
            data.push(logInfo);
        }

        /* Format and create the CSV file with the log data */
        var csvData = d3.csvFormat(data, ["Course Name", "Course ID", "Link to Evaluation", "Evaluation Found", "Errors"]);

        /* Log the csv, and download it */
        download(csvData, 'brightspaceReport.csv');
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