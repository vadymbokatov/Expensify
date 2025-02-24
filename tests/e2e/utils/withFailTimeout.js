import CONFIG from '../config';

const TIMEOUT = process.env.INTERACTION_TIMEOUT || CONFIG.INTERACTION_TIMEOUT;

const withFailTimeout = (promise, name) =>
    new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`[${name}] Interaction timed out after ${(TIMEOUT / 1000).toFixed(0)}s`));
        }, Number(TIMEOUT));

        promise
            .then((value) => {
                resolve(value);
            })
            .catch((e) => {
                reject(e);
            })
            .finally(() => {
                clearTimeout(timeoutId);
            });
    });

export default withFailTimeout;
