const Eth = require('ethjs');
const { getABI } = require('../utils.js');

// const EthFilter = require('ethjs-filter');
// Parse JavaScript parameters into something ethjs can use
function parseParameters(params) {
    const output = [];

    for (let i = 0; i < params.length; i++) {
        const param = params[i];

        if (typeof param == 'string') {
            if (param.startsWith('0x')) {
                // Already in hex
                output.push(param);
            }
            else {
                // Handle strings
                output.push(Eth.fromAscii(param));
            }

        }
        else if (typeof param == 'number') {
            // Parse numbers to big nums
            output.push(Eth.toBN(param));
        }
        else if (typeof param == 'object') {
            if (param.constructor.name == 'BN') {
                // Bignums are fine
                output.push(param);
            }
            else {
                return new Error("Unable to handle parameter of type " + param.constructor.name);
            }
        }
        else {
            return new Error("Unable to handle parameter of type " + typeof param);
        }
    }

    return output;
}

class Arbiter {
    constructor(eth, network, contractAddress) {
        this.eth = eth;
        this.address = getAddress("Arbiter", network, contractAddress);
        this.abiFile = getABI("Arbiter");
        this.contract = eth.contract(this.abiFile).at(this.address);
        // this.filters = new EthFilter(eth);
    }

    // Initiate a subscription
    async initiateSubscription({ oracleAddress, endpoint, js_params, dots, publicKey, from, gas }) {
        try {
            const params = parseParameters(js_params);
            // Make sure we could parse it correctly
            if (params instanceof Error) {
                throw params;
            }

            return await this.contract.initiateSubscription(
                oracleAddress,
                endpoint,
                params,
                publicKey,
                dots,
                { from: from, gas: gas }
            );
        } catch (err) {
            throw err;
        }
    }

    // Listen for initiate events
    async listen() {
        try {
            const accounts = await this.eth.accounts();
            if (accounts.length == 0) {
                throw new Error("No accounts loaded");
            }
            const account = accounts[0];

            
            // Create the Event filter
            this.filter = this.contract.DataPurchase();
            this.filter.new({ toBlock: 'latest' }, (err, res) => {
                if (err) throw err;
            });

            // Watch the event filter
            const result = await new Promise((resolve, reject) => {
                this.filter.watch((err, res) => {
                    if (err) return reject(err);
                    if (res && res.length) return resolve(res);
                });
            });

            // Sanity check
            if (result.length !== 6) {
                throw new Error("Received invalid event");
            }

            const [
                provider,
                subscriber,
                public_key,
                endBlock,
                endpoint_params,
                endpoint
            ] = result;

            // Make sure it is us
            if (provider != account || subscriber != account) {
                return;
            }

            // Get the block number
            const blockNumber = await this.eth.blockNumber();
            // Emit event
            return {
                provider,
                subscriber,
                public_key,
                endblock: endBlock + blockNumber.toNumber(),
                endpoint_params,
                endpoint,
            };
        } catch (err) {
            throw err;
        }
    }

    // Close the connection
    close() {
        if (this.filter) {
            this.filter.uninstall();
            delete this.filter;
        }
    }
}

module.exports = Arbiter;
