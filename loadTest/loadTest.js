const http = require('http');
const assert = require('assert');

const endPoint = 'restau-lb8a1-lsr6rtqzforx-219961156.us-east-1.elb.amazonaws.com';
const port = 80;

const restaurantName = 'ArielsRestaurantA';
const cuisineName = [
    "Italian", "Chinese", "Japanese", "Mexican", "Indian", "French", "Thai", "Spanish", "Greek", "Lebanese",
    "Turkish", "Moroccan", "Vietnamese", "Korean", "Caribbean", "Brazilian", "Ethiopian", "Russian", "German",
    "Cuban", "American", "British", "Portuguese", "Argentinian", "Peruvian", "Swedish", "Indonesian", "Malaysian",
    "Filipino"
];

const regionName = [
    "Acre", "Arad", "Ariel", "Ashdod", "Ashkelon", "BatYam", "Beersheba", "BeitShemesh", "BeitShean", "BneiBrak",
    "Dimona", "Eilat", "Givatayim", "Hadera", "Haifa", "Herzliya", "HodHaSharon", "Holon", "Jerusalem", "Karmiel",
    "KfarSaba", "KiryatAta", "KiryatBialik", "KiryatGat", "KiryatMalakhi", "KiryatMotzkin", "KiryatOno", "KiryatShmona",
    "KiryatYam", "Lod", "MaaleAdumim", "MigdalHaEmek", "ModiinMaccabimReut", "ModiinIllit", "Nahariya", "Nazareth",
    "NazarethIllit", "Nesher", "NessZiona", "Netanya", "Netivot", "Ofakim", "OrAkiva", "Petah Tikva", "Raanana", "Rahat",
    "RamatGan", "RamatHaSharon", "Ramla", "Rehovot", "RishonLeZion", "RoshHaAyin", "Safed", "Sderot", "TelAviv",
    "Tiberias", "Tira", "Tzfat", "Yavne", "Yokneam"
];

const numRequests = 100;

// Function to make HTTP requests
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

// Function to test POST method
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

        console.log(`POST ${postOptions.path} Status Code: ${postResponse.statusCode}; Time Elapsed: ${elapsedTimeInMs}ms`);

    } catch (error) {
        console.error('POST Test failed:', error);
    }
};

// Function to test GET method
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

        console.log(`GET ${getOptions.path} Status Code: ${getResponse.statusCode}; Time Elapsed: ${elapsedTimeInMs}ms`);

    } catch (error) {
        console.error('GET Test failed:', error);
    }
};

// Function to test complex GET method
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

        console.log(`GET ${getOptions.path} Status Code: ${getResponse.statusCode}; Time Elapsed: ${elapsedTimeInMs}ms`);

    } catch (error) {
        console.error('GET Test failed:', error);
    }
};

// Function to test DELETE method
const testDeleteMethod = async (i) => {
    const RestaurantAName = 'ArielsRestaurantA' + i;

    const deleteOptions = {
        hostname: endPoint,
        port: port,
        path: `/restaurants/${RestaurantAName}`,
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

        console.log(`DELETE ${deleteOptions.path} Status Code: ${deleteResponse.statusCode}; Time Elapsed: ${elapsedTimeInMs}ms`);

    } catch (error) {
        console.error('DELETE Test failed:', error);
    }
};

// Load test function to run all tests
const loadTest = async () => {
    console.log(`Starting load test with ${numRequests} requests`);

    console.log(`Testing POST method...`);
    for (let i = 1; i <= numRequests; i++) {
        await testPostMethod(i);
    }

    console.log(`Testing GET x3 method...`);
    for (let j = 1; j <= 3; j++) {
        for (let i = 1; i <= numRequests; i++) {
            await testGetMethod(i);
        }
    }

    console.log(`Testing DELETE method...`);
    for (let i = 1; i <= numRequests; i++) {
        await testDeleteMethod(i);
    }
};

// Execute load test
loadTest().catch(console.error);
