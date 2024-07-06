const http = require('http');
const assert = require('assert');

const endPoint = 'restau-lb8a1-lsr6rtqzforx-219961156.us-east-1.elb.amazonaws.com';
const port = 80;

const restaurantName = 'MyRestaurant';
const cuisineName = [
    "Mediterranean", "Japanese", "Mexican", "Indian", "French", "Thai", "Spanish", "Irish", "Vietnamese", "Lebanese",
    "Turkish", "Moroccan", "Korean", "Caribbean", "Brazilian", "Ethiopian", "Russian", "German", "Cajun",
    "American", "British", "Peruvian", "Swedish", "Indonesian", "Malaysian", "Filipino", "Hawaiian", "Israeli",
    "Tex-Mex"
];

const regionName = [
    "Amsterdam", "Berlin", "Copenhagen", "Dublin", "Edinburgh", "Florence", "Geneva", "Helsinki", "Istanbul", "Jakarta",
    "Kyoto", "Lisbon", "Madrid", "Nairobi", "Oslo", "Paris", "Quito", "Rome", "Seoul", "Tokyo",
    "Venice", "Warsaw", "Xian", "Yerevan", "Zurich"
];

const requests = 100;

/**
 * Function to make HTTP requests
 * @param {Object} options - Options for the HTTP request (hostname, port, path, method, headers)
 * @param {string|null} postData - Data to be sent with POST requests (optional)
 * @returns {Promise<Object>} - Promise that resolves with an object containing statusCode and data
 */
const makeRequest = (options, postData = null) => {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve({ statusCode: res.statusCode, data: data });
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        if (postData) {
            req.write(postData);
        }

        req.end();
    });
};

/**
 * Function to test POST method
 * @param {number} i - Index for generating unique restaurant name
 */
const testPostMethod = async (i) => {
    const RestaurantAName = restaurantName + i;
    const restaurant = {
        name: RestaurantAName,
        cuisine: cuisineName[i % cuisineName.length],
        region: regionName[i % regionName.length]
    };

    const postOptions = {
        hostname: endPoint,
        port: port,
        path: '/restaurants',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    };

    try {
        // Make the POST request to add the restaurant
        const startTime = process.hrtime(); // Start time
        const postResponse = await makeRequest(postOptions, JSON.stringify(restaurant));
        const endTime = process.hrtime(startTime); // End time
        const elapsedTimeInMs = ((endTime[0] * 1e9 + endTime[1]) / 1e6).toFixed(2); // Calculate time in milliseconds

        // Assert that the POST request was successful
        assert.strictEqual(postResponse.statusCode, 200, 'Expected POST status code to be 200');

        console.log(`[${i}] POST ${postOptions.path}: Status ${postResponse.statusCode}, Time ${elapsedTimeInMs}ms`);

    } catch (error) {
        console.error(`[${i}] POST Test failed:`, error);
    }
};

/**
 * Function to test GET method
 * @param {number} i - Index for generating unique restaurant name
 */
const testGetMethod = async (i) => {
    const RestaurantAName = restaurantName + i;

    const getOptions = {
        hostname: endPoint,
        port: port,
        path: `/restaurants/${RestaurantAName}`,
        method: 'GET'
    };

    try {
        // Make the GET request to retrieve the added restaurant
        const startTime = process.hrtime(); // Start time
        const getResponse = await makeRequest(getOptions);
        const endTime = process.hrtime(startTime); // End time
        const elapsedTimeInMs = ((endTime[0] * 1e9 + endTime[1]) / 1e6).toFixed(2); // Calculate time in milliseconds

        // Add assertions to validate the GET response
        assert.strictEqual(getResponse.statusCode, 200, 'Expected GET status code to be 200');
        const responseData = JSON.parse(getResponse.data);
        assert.strictEqual(responseData.name, RestaurantAName, 'Expected restaurant name to match');
        assert.strictEqual(responseData.cuisine, cuisineName[i % cuisineName.length], 'Expected cuisine to match');
        assert.strictEqual(responseData.region, regionName[i % regionName.length], 'Expected region to match');

        console.log(`[${i}] GET ${getOptions.path}: Status ${getResponse.statusCode}, Time ${elapsedTimeInMs}ms`);

    } catch (error) {
        console.error(`[${i}] GET Test failed:`, error);
    }
};

/**
 * Function to test complex GET method
 * @param {number} i - Index for generating unique restaurant name
 */
const testGetComplexMethod = async (i) => {
    const limitOptions = (i % 100) + 1;
    const getOptions = {
        hostname: endPoint,
        port: port,
        path: `/restaurants/cuisine/${cuisineName[i % cuisineName.length]}`,
        method: 'GET'
    };

    try {
        // Make the GET request to retrieve the added restaurant
        const startTime = process.hrtime(); // Start time
        const getResponse = await makeRequest(getOptions, JSON.stringify(limitOptions));
        const endTime = process.hrtime(startTime); // End time
        const elapsedTimeInMs = ((endTime[0] * 1e9 + endTime[1]) / 1e6).toFixed(2); // Calculate time in milliseconds

        assert.strictEqual(getResponse.statusCode, 200, 'Expected GET status code to be 200');

        console.log(`[${i}] GET ${getOptions.path}: Status ${getResponse.statusCode}, Time ${elapsedTimeInMs}ms`);

    } catch (error) {
        console.error(`[${i}] GET Test failed:`, error);
    }
};

/**
 * Function to test DELETE method
 * @param {number} i - Index for generating unique restaurant name
 */
const testDeleteMethod = async (i) => {
    const RestaurantAName = restaurantName + i; // Use the same logic as in POST and GET methods

    const deleteOptions = {
        hostname: endPoint,
        port: port,
        path: `/restaurants/${RestaurantAName}`, // Use the correct path format
        method: 'DELETE'
    };

    try {
        // Make the DELETE request to delete the restaurant
        const startTime = process.hrtime(); // Start time
        const deleteResponse = await makeRequest(deleteOptions);
        const endTime = process.hrtime(startTime); // End time
        const elapsedTimeInMs = ((endTime[0] * 1e9 + endTime[1]) / 1e6).toFixed(2); // Calculate time in milliseconds

        // Assert that the DELETE request was successful
        assert.strictEqual(deleteResponse.statusCode, 200, 'Expected DELETE status code to be 200');
        const deleteResponseData = JSON.parse(deleteResponse.data);
        assert.deepStrictEqual(deleteResponseData, { success: true }, 'Expected success message');

        console.log(`[${i}] DELETE ${deleteOptions.path}: Status ${deleteResponse.statusCode}, Time ${elapsedTimeInMs}ms`);

    } catch (error) {
        console.error(`[${i}] DELETE Test failed:`, error);
    }
};

/**
 * Load test function to run all tests (POST, GET x3, DELETE)
 */
const loadTest = async () => {
    console.log(`Starting load test with ${requests} requests`);

    console.log(`Testing POST...`);
    for (let i = 1; i <= requests; i++) {
        await testPostMethod(i);
    }

    console.log(`Testing GET x3...`);
    for (let j = 1; j <= 3; j++) {
        for (let i = 1; i <= requests; i++) {
            await testGetMethod(i);
        }
    }

    console.log(`Testing DELETE...`);
    for (let i = 1; i <= requests; i++) {
        await testDeleteMethod(i);
    }
};

// Execute load test
loadTest().catch(console.error);
