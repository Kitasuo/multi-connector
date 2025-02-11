'use strict';
/**
 * Module dependencies.
 */
const winston = require('../../logger.js');
const rp = require('request-promise');

/**
 * Schneider id double encoding.
 */

/**
 * Manipulates request parameters.
 *
 * @param {Object} config
 * @param {Object} parameters
 * @return {Object}
 */
const parameters = async (config, parameters) => {
    try {
        if (Object.hasOwnProperty.call(parameters, 'ids')) {
            if (Array.isArray(parameters.ids)) {
                for (let i = 0; i < parameters.ids.length; i++) {
                    parameters.ids[i] = encodeURIComponent(encodeURIComponent(parameters.ids[i].id || parameters.ids[i].idLocal || parameters.ids[i]));
                }
            }
        }
        return parameters;
    } catch (err) {
        return parameters;
    }
};

/**
 * Sends http request.
 *
 * @param {String} method
 * @param {String} url
 * @param {Object} [headers]
 * @param {String/Object/Array} [body]
 * @return {Promise}
 */
function request (method, url, headers, body) {
    const options = {
        method: method,
        uri: url,
        json: true,
        body: body,
        resolveWithFullResponse: true,
        headers: headers,
    };

    return rp(options).then(result => Promise.resolve(result))
        .catch((error) => {
            return Promise.reject(error);
        });
}

/**
 * Switch querying protocol to REST.
 *
 * @param {Object} config
 * @param {Object} template
 * @return {Object}
 */
const template = async (config, template) => {
    try {
        // Skip subscription if query includes only one id.
        const ids = template.parameters.ids.map(item => decodeURIComponent(decodeURIComponent(item.id)));
        if (ids.length < 5) {
            return template;
        }
        template.parameters.ids = ids;

        const oauth2 = template.plugins.find(p => p.name === 'oauth2');
        if (!oauth2) {
            return Promise.reject();
        }

        const options = await oauth2.request(template, {});
        const domain = template.authConfig.url;

        // Create subscription.
        const createSubscriptionBodyUrl = domain + '/Subscriptions/Create';
        const SubscriptionBody = {
            SubscriptionType: 'ValueItemChanged',
            Ids: ids,
        };
        const createdSubscription = await request('POST', createSubscriptionBodyUrl, options.headers, SubscriptionBody);

        // Create notification.
        const createNotificationUrl = domain + '/Notifications/Create';
        const notificationBody = {
            SubscriptionId: createdSubscription.body.Id,
            ChangesOnly: false,
        };
        const createdNotification = await request('POST', createNotificationUrl, options.headers, notificationBody);

        // Get notification.
        const getNotificationUrl = domain + '/Notifications/' + createdNotification.body.Id + '/Items';
        const {body} = await request('GET', getNotificationUrl, options.headers);

        // Delete notification.
        const deleteNotificationUrl = domain + '/Notifications/' + createdNotification.body.Id + '/Delete';
        await request('DELETE', deleteNotificationUrl, options.headers);

        // Delete subscription.
        const deleteSubscriptionUrl = domain + '/Subscriptions/' + createdSubscription.body.Id + '/Delete';
        await request('DELETE', deleteSubscriptionUrl, options.headers);

        template.generalConfig = {
            hardwareId: {dataObjectProperty: 'ChangedItemId'},
            timestamp: {dataObjectProperty: 'ChangedAt'},
        };

        template.authConfig.path = body;
        template.protocol = 'custom';
    } catch (err) {
        winston.log('error', err.message);
        return template;
    }
    return template;
};

/**
 * Expose plugin methods.
 */
module.exports = {
    name: 'schneider',
    parameters,
    template,
};
