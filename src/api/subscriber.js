const accounts = require('../account.js');
const crypto = require('crypto');
const fs = require('browserify-fs');
const Web3 = require('web3');
const SharedCrypto = require('./sharedcrypto.js');
const SynapseSubscription = require('./subscription.js');

// Market contract
const file = "../market/contracts/abi.json";
const abi = JSON.parse(fs.readFileSync(file));
const marketAddress = "0x732a5496383DE6A55AE2Acc8829BE7eCE0833113";

// Create a sending RPC
const rpcHost = "https://rinkeby.infura.io";
const web3 = new Web3(new Web3.providers.HttpProvider(rpcHost));
const SynapseMarket = new web3.eth.Contract(abi, marketAddress);

// Create a listening RPC
const rpcHost_listen = "ws://dendritic.network:8546";
const web3_listen = new Web3(Web3.givenProvider || rpcHost_listen);
const SynapseMarket_listen = new web3_listen.eth.Contract(abi, marketAddress);

// Accounts
const privateKeyHex = "0x7909ef9ab5279d31a74b9f49c58cf5be5c033ae7e9d7e2eb46a071b9802c5e22";
const account = new accounts(privateKeyHex);

account.setWeb3(web3);

console.log(web3.eth.accounts.wallet[0].address);

class SynapseSubscriber {
    constructor(marketAddress, configFile = ".synapsesubscriber", callback = undefined) {
        this.marketInstance = SynapseMarket;
        this.checkForRegister(configFile, callback);
    }

    // Check whether or not we need to register, if so register
    checkForRegister(configFile, callback) {
        // Already regsitered
        if (fs.existsSync(configFile)) {
            const data = JSON.parse(fs.readFileSync(configFile));

            this.private_key = data.private_key;

            // Generate a secp224k1 keypair
            this.keypair = new SharedCrypto.PublicKey(null, this.private_key);

            console.log("public key", this.keypair.getPublic());
            console.log("private key", this.keypair.getPrivate());

            // Load the subscriptions into internal objects
            this.subscriptions = data.subscriptions.map(data => {
                const obj = SynapseSubscription.fromObject(data);

                // If a callback was passed, initiate the stream with that
                if (callback) {
                    obj.data(callback);
                }

                return obj;
            });

            return;
        }

        this.keypair = new SharedCrypto.PublicKey();

        console.log("Successfully registered");
        console.log ("public key", this.keypair.getPublic());
        console.log ("private key", this.keypair.getPrivate());

        fs.writeFileSync(".synapsesubscriber", JSON.stringify({
            private_key: this.keypair.getPrivate(),
            subscriptions: []
        }));

        this.subscriptions = [];
    }

    // Create a new subscription
    newSubscription(group, callback) {
        // Conver group to bytes32 string
        group = web3.utils.utf8ToHex(group);

        console.log("Looking for a provider of data");

        // Send the request
        this.marketInstance.methods.requestSynapseProvider(group).send({
            from: web3.eth.accounts.wallet[0].address,
            gas: 4700000 // TODO - not this
        }, (err, result) => {
            if (err) {
                throw err;
            }

            console.log("Sent the request");

            // Watch for SynapseProviderFound events
            const event = SynapseMarket_listen.SynapseProviderFound();

            event.watch((err, found_res) => {
                if (err) {
                    throw err;
                }

                // Make sure it was generated by the above request
                if (found_res.transactionHash != result.transactionHash) {
                    return;
                }

                console.log("Found a provider of data");

                // Get the index of the provider
                const provider_index = found_res.args.index;

                this.newSubscriptionWithIndex(provider_index, group, 0, callback);
            });
        });
    }

    // Start a subscription with a provider index
    newSubscriptionWithIndex(provider_index, group, amount, callback) {
        console.log("Starting subscription with index", provider_index);

        // Make sure group is a bytes32 compatible object
        if (group.substring(0, 2) != '0x') {
            group = web3.utils.utf8ToHex(group);
        }

        // Get the information of the provider
        
        this.marketInstance.methods.getProviderAddress(group, provider_index).call().then(providers_address => {
            this.marketInstance.methods.getProviderPublic(group, provider_index).call().then(providers_public => {
                console.log(providers_address, providers_public)
                // Parse solidity's garbage.
                let provider_public_hex = providers_public.substr(2);

                if ( provider_public_hex.length != (28 * 2) ) {
                    provider_public_hex = provider_public_hex.slice(0, 58);
                }

                // Do the key exchange
                const provider_public_ec = new SharedCrypto.PublicKey(provider_public_hex, null);
                const secret = this.keypair.generateSecret(provider_public_ec);
               
                // Generate a nonce
                const nonce = new Buffer(crypto.randomBytes(16));
                const nonce_hex = "0x" + nonce.toString('hex');

                // Generate a UUID
                const uuid = crypto.randomBytes(32);

                // Setup the cipher object with the secret and nonce
                const cipher = crypto.createCipheriv('aes-256-ctr', secret, nonce);

                cipher.setAutoPadding(false);

                // Encrypt it (output is buffer)
                const euuid = cipher.update(uuid) +
                              cipher.final();

                // Sanity check
                if (euuid.length > 32) {
                    throw new Error("encrypted uuid is too long!");
                }

                // Hexify the euuid
                const euuid_hex = "0x" + new Buffer(euuid, 'ascii').toString('hex');

                // Get my public key
                const public_key = "0x" + this.keypair.getPublic();

                // Parse the amount
                amount = web3.utils.fromDecimal(amount);

                // Initiate the data feed
                this.marketInstance.methods.initSynapseDataFeed(
                    group,
                    providers_address,
                    public_key,
                    euuid_hex,
                    nonce_hex,
                    amount
                ).send({
                    from: web3.eth.accounts.wallet[0].address,
                    gas: 4700000 // TODO - not this

                }).once('transactionHash', (transactionHash) => {
                    //SynapseMarket_listen.events.allEvents({}, function (error, log) {
                    //    if (!error)
                    //        console.log(875685,log);
                    //});

                    //console.log(3,transactionHash) 

                }).on("error", (error) => {
                    console.log(37776, error);
                }).then((receipt) => {
                    console.log("Data feed initiated");

                    // Create the subscription object
                    const subscription = new SynapseSubscription(public_key, secret, nonce, uuid.toString('base64'));
                    subscription.data(callback);
                })

            });
        });
        
    }
}

const subscriber = new SynapseSubscriber(marketAddress, ".synapsesubscriber");

setTimeout(() => {
    subscriber.newSubscriptionWithIndex(0, "avi1", 10, (err, data) => {
        console.log(765765, err);
        console.log(973, data);
    });
}, 5000);

module.exports = SynapseSubscriber;
