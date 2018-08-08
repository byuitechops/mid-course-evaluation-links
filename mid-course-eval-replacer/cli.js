var prompt = require('prompt');
var replacer = require('./index.js');

function getInput() {
    return new Promise((resolve, reject) => {
        // prompt for the filepath to read from, and their brightspace username and password
        var schema = {
            properties: {
                verify: {
                    type: 'string',
                    pattern: /true|false/,
                    message: `<true/false>`,
                    required: true,
                    default: 'false'
                },
                domain: {
                    type: 'string',
                    pattern: /pathway|byui/,
                    message: `<pathway/byui>`,
                    required: true,
                    default: 'byui'
                },
                path: {
                    type: 'string',
                    message: `(i.e. './myfile.csv')`,
                    required: true,
                },
                username: {
                    type: 'string',
                    message: `Type your Brightspace username`,
                    required: true,
                },
                password: {
                    hidden: true,
                    required: true
                }
            }
        };

        prompt.start();

        prompt.get(schema, (err, userInput) => {
            if (err) {
                console.error(err);
                return reject(err);
            }
            resolve(userInput);
        });
    });
}

async function run() {
    var userInput = await getInput()
    replacer.login(userInput);
}

run();