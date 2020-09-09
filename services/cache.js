const mongoose = require('mongoose');
const redis = require('redis');
const util = require('util');
const keys = require('../config/keys');

const client = redis.createClient(keys.redisUrl);
client.hget = util.promisify(client.hget);

mongoose.Query.prototype.cache = function(options = {}) {
    this._cache = true;
    this._hashKey = JSON.stringify(options.key || '');

	// Making it chainable.
	return this;
};

/**
 * --------------REDIS-------------------
 * |       |   users     |              |
 * |   1   |   blogs     |   result     |
 * |       |             |              |
 * |   2   |   blogs     |   result     |
 * --------------------------------------
 */

// Storing reference to original exec function.
const exec = mongoose.Query.prototype.exec;

// Override this function to add additional logic.
mongoose.Query.prototype.exec = async function() {
	console.log('RUN QUERY');

	if (!this._cache) {
		console.log('34: SERVED FROM DB');
		return exec.apply(this, arguments);
	}

	const key = JSON.stringify({ ...this.getFilter(), collection: this.mongooseCollection.name });

	// See if we have a value for 'key' in redis.
	const cacheValue = await client.hget(this._hashKey, key);

	// If we do, return that.
	if (cacheValue) {
		// exec fuction expects us to return mongoose model rather than plain JSON data
		const doc = JSON.parse(cacheValue);
		console.log('SERVED FROM CACHE');
		return Array.isArray(doc) ? doc.map((d) => new this.model(d)) : new this.model(doc);
	}

	// Otherwise, issue that query and store the result in redis,
	// run original copy of untouched exec.
	const result = await exec.apply(this, arguments);
	client.hset(this._hashKey, key, JSON.stringify(result));
	console.log('55: SERVED FROM DB');
	return result;
};

module.exports = {
    clearHash(hashKey) {
        client.del(JSON.stringify(hashKey));
    }
}