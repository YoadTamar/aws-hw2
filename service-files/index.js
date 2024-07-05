const express = require('express');
const AWS = require('aws-sdk');
const RestaurantsMemcachedActions = require('./model/restaurantsMemcachedActions');

const app = express();
app.use(express.json());

const MEMCACHED_CONFIGURATION_ENDPOINT = process.env.MEMCACHED_CONFIGURATION_ENDPOINT;
const TABLE_NAME = process.env.TABLE_NAME;
const AWS_REGION = process.env.AWS_REGION;
const USE_CACHE = process.env.USE_CACHE === 'true';

const memcachedActions = new RestaurantsMemcachedActions(MEMCACHED_CONFIGURATION_ENDPOINT);

// Create a new DynamoDB instance
const dynamodb = new AWS.DynamoDB.DocumentClient({ region: AWS_REGION });

app.get('/', (req, res) => {
    const response = {
        MEMCACHED_CONFIGURATION_ENDPOINT: MEMCACHED_CONFIGURATION_ENDPOINT,
        TABLE_NAME: TABLE_NAME,
        AWS_REGION: AWS_REGION,
        USE_CACHE: USE_CACHE
    };
    res.send(response);
});


// POST /restaurants
app.post('/restaurants', async (req, res) => {
    const restaurant = req.body;

    if (!restaurant.name || !restaurant.cuisine || !restaurant.region) {
        res.status(400).send({ success: false, message: 'Missing required fields' });
        return;
    }

    // Check if the restaurant already exists in the table before adding it (only dynamodb)
    const getParams = {
        TableName: TABLE_NAME,
        Key: {
            SimpleKey: restaurant.name
        }
    };

    if (USE_CACHE) {
        try {
            const cachedRestaurant = await memcachedActions.getRestaurants(restaurant.name);
            if (cachedRestaurant) {
                res.status(409).send({ success: false, message: 'Restaurant already exists' });
                return;
            }
        } catch (cacheError) {
            console.error('Error accessing memcached:', cacheError);
        }
    }

    else {
        try {
            const data = await dynamodb.get(getParams).promise();

            if (data.Item) {
                res.status(409).send({ success: false, message: 'Restaurant already exists' });
                return;
            }

        } catch (err) {
            console.error('POST /restaurants', err);
            res.status(500).send("Internal Server Error");
            return;
        }
    }

    // Add the restaurant to the DynamoDB table
    const params = {
        TableName: TABLE_NAME,
        Item: {
            SimpleKey: restaurant.name,
            Cuisine: restaurant.cuisine,
            GeoRegion: restaurant.region,
            Rating: restaurant.rating || 0,
            RatingCount: 0
        }
    };

    try {
        await dynamodb.put(params).promise();

        if (USE_CACHE) {
            // Invalidate cache
            const cacheKeysToInvalidate = [];

            // Generate cache keys covering all possible limit values (10 to 100)
            for (let limit = 10; limit <= 100; limit += 1) {
                cacheKeysToInvalidate.push(`${restaurant.region}_limit_${limit}`);
                cacheKeysToInvalidate.push(`${restaurant.region}_${restaurant.cuisine}_limit_${limit}`);

                for (let minRating = 0; minRating <= 5; minRating += 0.1) {
                    cacheKeysToInvalidate.push(`${restaurant.cuisine}_minRating_${minRating}_limit_${limit}`);
                }
            }

            try {
                const deletePromises = cacheKeysToInvalidate.map(key => memcachedActions.deleteRestaurants(key).catch(err => {
                    if (err.cmdTokens && err.cmdTokens[0] === 'NOT_FOUND') {
                        //console.log(`Cache key "${key}" not found, ignoring.`);
                    } else {
                        throw err; // Propagate other errors
                    }
                }));
                await Promise.all(deletePromises);
                //console.log('Cache invalidated for:', cacheKeysToInvalidate);
            } catch (cacheError) {
                console.error('Error invalidating memcached:', cacheError);
            }

            // Now add the new restaurant to the cache
            try {
                await memcachedActions.addRestaurants(restaurant.name, restaurant);
                //console.log('Added to cache:', restaurant.name);
            } catch (cacheError) {
                console.error('Error adding to memcached:', cacheError);
            }
        }

        res.status(200).send({ success: true });
    } catch (err) {
        console.error('POST /restaurants', err);
        res.status(500).send("Internal Server Error");
    }
});

// GET /restaurants/:restaurantName
app.get('/restaurants/:restaurantName', async (req, res) => {
    const restaurantName = req.params.restaurantName;

    if (USE_CACHE) {
        try {
            const cachedRestaurant = await memcachedActions.getRestaurants(restaurantName);
            if (cachedRestaurant) {
                // Change the rating back to a number
                cachedRestaurant.rating = parseFloat(cachedRestaurant.rating) || 0;
                res.status(200).send(cachedRestaurant);
                return;
            }
        } catch (cacheError) {
            console.error('Error accessing memcached:', cacheError);
        }
    }

    // Check if the restaurant exists in the DynamoDB table
    const params = {
        TableName: TABLE_NAME,
        Key: {
            SimpleKey: restaurantName
        }
    };

    try {
        const data = await dynamodb.get(params).promise();

        if (!data.Item) {
            res.status(404).send({ message: 'Restaurant not found' });
            return;
        }

        // Parse the restaurant data
        const restaurant = {
            name: data.Item.SimpleKey,
            cuisine: data.Item.Cuisine,
            rating: data.Item.Rating || 0,
            region: data.Item.GeoRegion
        };

        // Add to cache if enabled
        if (USE_CACHE) {
            try {
                // Change the rating to a string to match the cache format
                restaurant.rating = restaurant.rating.toString();
                await memcachedActions.addRestaurants(restaurantName, restaurant);
            } catch (cacheError) {
                console.error('Error adding to memcached:', cacheError);
            }
        }

        res.status(200).send(restaurant);
    } catch (err) {
        console.error('GET /restaurants/:restaurantName', err);
        res.status(500).send('Internal Server Error');
    }
});

// DELETE /restaurants/:restaurantName
app.delete('/restaurants/:restaurantName', async (req, res) => {
    const restaurantName = req.params.restaurantName;

    // Delete the restaurant from DynamoDB
    const params = {
        TableName: TABLE_NAME,
        Key: {
            SimpleKey: restaurantName
        }
    };

    try {
        const data = await dynamodb.get(params).promise();

        if (!data.Item) {
            res.status(404).send({ message: 'Restaurant not found' });
            return;
        }

        if (USE_CACHE) {
            try {
                await memcachedActions.deleteRestaurants(restaurantName);
                //console.log('Cache invalidated for:', restaurantName);
            } catch (cacheError) {
                console.error('Error invalidating memcached:', cacheError);
            }
    
            try {
                // Invalidate cache
                const cacheKeysToInvalidate = [];
    
                // Generate cache keys covering all possible limit values (10 to 100)
                for (let limit = 10; limit <= 100; limit += 1) {
                    cacheKeysToInvalidate.push(`${data.Item.region}_limit_${limit}`);
                    cacheKeysToInvalidate.push(`${data.Item.region}_${data.Item.cuisine}_limit_${limit}`);
    
                    for (let minRating = 0; minRating <= 5; minRating += 0.1) {
                        cacheKeysToInvalidate.push(`${data.Item.cuisine}_minRating_${minRating}_limit_${limit}`);
                    }
                }
    
                try {
                    const deletePromises = cacheKeysToInvalidate.map(key => memcachedActions.deleteRestaurants(key).catch(err => {
                        if (err.cmdTokens && err.cmdTokens[0] === 'NOT_FOUND') {
                            //console.log(`Cache key "${key}" not found, ignoring.`);
                        } else {
                            throw err; // Propagate other errors
                        }
                    }));
                    await Promise.all(deletePromises);
                    //console.log('Cache invalidated for:', cacheKeysToInvalidate);
                } catch (cacheError) {
                    console.error('Error invalidating memcached:', cacheError);
                }
    
            } catch (cacheError) {
                console.error('Error invalidating memcached:', cacheError);
                // Handle cache invalidation error if needed
            }
        }

        await dynamodb.delete(params).promise();
        console.log('Restaurant', restaurantName, 'deleted successfully');
        res.status(200).send({ success: true });
    } catch (err) {
        console.error('DELETE /restaurants/:restaurantName', err);
        res.status(500).send('Internal Server Error');
    }
});

// POST /restaurants/rating
app.post('/restaurants/rating', async (req, res) => {
    const restaurantName = req.body.name;
    const newRating = req.body.rating;

    if (!restaurantName || !newRating) {
        console.error('POST /restaurants/rating', 'Missing required fields');
        res.status(400).send({ success: false, message: 'Missing required fields' });
        return;
    }

    // Get the current data for the restaurant
    const params = {
        TableName: TABLE_NAME,
        Key: {
            SimpleKey: restaurantName
        }
    };

    try {
        const data = await dynamodb.get(params).promise();

        if (!data.Item) {
            res.status(404).send("Restaurant not found");
            return;
        }

        // Calculate the new average rating
        const oldRating = data.Item.Rating || 0;
        const ratingCount = data.Item.RatingCount || 0;
        const newAverageRating = ((oldRating * ratingCount) + newRating) / (ratingCount + 1);

        // Update the restaurant's rating
        const updateParams = {
            TableName: TABLE_NAME,
            Key: {
                SimpleKey: restaurantName
            },
            UpdateExpression: 'set Rating = :r, RatingCount = :rc',
            ExpressionAttributeValues: {
                ':r': newAverageRating,
                ':rc': ratingCount + 1
            }
        };

        await dynamodb.update(updateParams).promise();

        // Purge the cache for this restaurant
        if (USE_CACHE) {
            try {
                // Update the rating in the cache
                await memcachedActions.addRestaurants(restaurantName, {
                    name: restaurantName,
                    cuisine: data.Item.Cuisine,
                    rating: newAverageRating.toString(),
                    region: data.Item.GeoRegion
                });

                //console.log('Cache invalidated for:', restaurantName);

                // Invalidate cache also for all possible cache keys that contain this restaurant
                const cacheKeysToInvalidate = [];

                // Generate cache keys covering all possible limit values (10 to 100)
                for (let limit = 10; limit <= 100; limit += 1) {
                    cacheKeysToInvalidate.push(`${data.Item.region}_limit_${limit}`);
                    cacheKeysToInvalidate.push(`${data.Item.region}_${data.Item.cuisine}_limit_${limit}`);

                    for (let minRating = 0; minRating <= 5; minRating += 0.1) {
                        cacheKeysToInvalidate.push(`${data.Item.cuisine}_minRating_${minRating}_limit_${limit}`);
                    }
                }

                try {
                    const deletePromises = cacheKeysToInvalidate.map(key => memcachedActions.deleteRestaurants(key).catch(err => {
                        if (err.cmdTokens && err.cmdTokens[0] === 'NOT_FOUND') {
                            //console.log(`Cache key "${key}" not found, ignoring.`);
                        } else {
                            throw err; // Propagate other errors
                        }
                    }));
                    await Promise.all(deletePromises);
                    //console.log('Cache invalidated for:', cacheKeysToInvalidate);
                } catch (cacheError) {
                    console.error('Error invalidating memcached:', cacheError);
                }

            } catch (cacheError) {
                console.error('Error invalidating memcached:', cacheError);
            }
        }

        res.status(200).send({ success: true });
    } catch (error) {
        console.error('POST /restaurants/rating', error);
        res.status(500).send("Internal Server Error");
    }
});

// GET /restaurants/cuisine/:cuisine
app.get('/restaurants/cuisine/:cuisine', async (req, res) => {
    const cuisine = req.params.cuisine;
    let limit = parseInt(req.query.limit) || 10;
    limit = Math.min(limit, 100);
    const minRating = parseFloat(req.query.minRating) || 0;

    if (!cuisine) {
        console.error('GET /restaurants/cuisine/:cuisine', 'Missing required fields');
        res.status(400).send({ success: false, message: 'Missing required fields' });
        return;
    }

    if (minRating < 0 || minRating > 5) {
        console.error('GET /restaurants/cuisine/:cuisine', 'Invalid rating');
        res.status(400).send({ success: false, message: 'Invalid rating' });
        return;
    }

    const cacheKey = `${cuisine}_minRating_${minRating}_limit_${limit}`;

    if (USE_CACHE) {
        try {
            const cachedRestaurants = await memcachedActions.getRestaurants(cacheKey);
            if (cachedRestaurants) {
                //console.log('Cache hit for:', cacheKey);
                // Convert the rating back to a number
                cachedRestaurants.forEach(restaurant => {
                    restaurant.rating = parseFloat(restaurant.rating) || 0;
                });
                res.status(200).json(cachedRestaurants);
                return;
            } else {
                //console.log('Cache miss for:', cacheKey);
            }
        } catch (cacheError) {
            console.error('Error accessing memcached:', cacheError);
        }
    }

    const params = {
        TableName: TABLE_NAME,
        IndexName: 'CuisineIndex',
        KeyConditionExpression: 'Cuisine = :cuisine',
        ExpressionAttributeValues: {
            ':cuisine': cuisine,
        },
        Limit: limit,
        ScanIndexForward: false // to get top-rated restaurants
    };

    try {
        const data = await dynamodb.query(params).promise();

        // Filter results based on minRating if not using FilterExpression in DynamoDB query
        const filteredRestaurants = data.Items.filter(item => item.Rating >= minRating);

        const restaurants = filteredRestaurants.map(item => ({
            cuisine: item.Cuisine,
            name: item.SimpleKey,
            rating: item.Rating,
            region: item.GeoRegion
        }));

        if (USE_CACHE) {
            try {
                await memcachedActions.addRestaurants(cacheKey, restaurants);
                //console.log('Added to cache:', cacheKey);
            } catch (cacheError) {
                console.error('Error adding to memcached:', cacheError);
            }
        }

        res.status(200).json(restaurants);
    } catch (error) {
        console.error('GET /restaurants/cuisine/:cuisine', error);
        res.status(500).send("Internal Server Error");
    }
});

// GET /restaurants/region/:region
app.get('/restaurants/region/:region', async (req, res) => {
    const region = req.params.region;
    let limit = parseInt(req.query.limit) || 10;
    limit = Math.min(limit, 100);

    if (!region) {
        console.error('GET /restaurants/region/:region', 'Missing required fields');
        res.status(400).send({ success: false, message: 'Missing required fields' });
        return;
    }

    const cacheKey = `${region}_limit_${limit}`;

    if (USE_CACHE) {
        try {
            const cachedRestaurants = await memcachedActions.getRestaurants(cacheKey);
            if (cachedRestaurants) {
                //console.log('Cache hit for:', cacheKey);

                // Convert the rating back to a number
                cachedRestaurants.forEach(restaurant => {
                    restaurant.rating = parseFloat(restaurant.rating) || 0;
                });
                res.status(200).send(cachedRestaurants);
                return;
            } else {
                //console.log('Cache miss for:', cacheKey);
            }
        } catch (cacheError) {
            console.error('Error accessing memcached:', cacheError);
        }
    }

    const params = {
        TableName: TABLE_NAME,
        IndexName: 'GeoRegionIndex',
        KeyConditionExpression: 'GeoRegion = :geoRegion',
        ExpressionAttributeValues: {
            ':geoRegion': region
        },
        Limit: limit,
        ScanIndexForward: false // to get top-rated restaurants
    };

    try {
        const data = await dynamodb.query(params).promise();

        const restaurants = data.Items.map(item => {
            return {
                cuisine: item.Cuisine,
                name: item.SimpleKey,
                rating: item.Rating,
                region: item.GeoRegion
            };
        });

        if (USE_CACHE) {
            try {
                await memcachedActions.addRestaurants(cacheKey, restaurants);
                //console.log('Added to cache:', cacheKey);
            } catch (cacheError) {
                console.error('Error adding to memcached:', cacheError);
            }
        }

        res.status(200).json(restaurants);
    } catch (error) {
        console.error('GET /restaurants/region/:region', error);
        res.status(500).send("Internal Server Error");
    }
});

// GET /restaurants/region/:region/cuisine/:cuisine
app.get('/restaurants/region/:region/cuisine/:cuisine', async (req, res) => {
    const region = req.params.region;
    const cuisine = req.params.cuisine;
    let limit = parseInt(req.query.limit) || 10;
    limit = Math.min(limit, 100);

    if (!region || !cuisine) {
        console.error('GET /restaurants/region/:region/cuisine/:cuisine', 'Missing required fields');
        res.status(400).send({ success: false, message: 'Missing required fields' });
        return;
    }

    const cacheKey = `${region}_${cuisine}_limit_${limit}`;

    if (USE_CACHE) {
        try {
            const cachedRestaurants = await memcachedActions.getRestaurants(cacheKey);
            if (cachedRestaurants) {
                //console.log('Cache hit for:', cacheKey);

                // Convert the rating back to a number
                cachedRestaurants.forEach(restaurant => {
                    restaurant.rating = parseFloat(restaurant.rating) || 0;
                });
                res.status(200).send(cachedRestaurants);
                return;
            } else {
                //console.log('Cache miss for:', cacheKey);
            }
        } catch (cacheError) {
            console.error('Error accessing memcached:', cacheError);
        }
    }

    const params = {
        TableName: TABLE_NAME,
        IndexName: 'GeoRegionCuisineIndex',
        KeyConditionExpression: 'GeoRegion = :geoRegion and Cuisine = :cuisine',
        ExpressionAttributeValues: {
            ':geoRegion': region,
            ':cuisine': cuisine
        },
        Limit: limit,
        ScanIndexForward: false // to get top-rated restaurants
    };

    try {
        const data = await dynamodb.query(params).promise();

        const restaurants = data.Items.map(item => {
            return {
                cuisine: item.Cuisine,
                name: item.SimpleKey,
                rating: item.Rating,
                region: item.GeoRegion
            };
        });

        if (USE_CACHE) {
            try {
                await memcachedActions.addRestaurants(cacheKey, restaurants);
                //console.log('Added to cache:', cacheKey);
            } catch (cacheError) {
                console.error('Error adding to memcached:', cacheError);
            }
        }

        res.status(200).json(restaurants);
    } catch (error) {
        console.error('GET /restaurants/region/:region/cuisine/:cuisine', error);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(80, () => {
    console.log('Server is running on http://localhost:80');
});

module.exports = { app };