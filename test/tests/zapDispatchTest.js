// import { keccak_256 } from 'js-sha3';

const instanceClass = require('../../src/api/contracts/ZapDispatch');
const ZapWrapper = require('../../src/api/ZapWrapper');
const assert = require('chai').assert;
const {
    webProvider,
    eth
} = require('../bootstrap');
// const { keccak_256, keccak256 } = require('js-sha3');
// const js_sha = require('js-sha3');
// const keccak256 = require('js-sha3').keccak256;
const Web3 = require('web3');
const web3 = new Web3( new Web3.providers.WebsocketProvider('http://127.0.0.1:7545') );
const { toBN, keccak256, fromAscii } = require('ethjs');
const { join } = require('path');
const {
    getInstanceOfSmartContract,
    getNewSmartContract,
    getNewRegistryContract,
    getNewCurrentCostContract,
    getNewBondageContract,
    getNewDispatchContract,
    getNewArbiterContract,
    providerPublicKey,
    providerTitle,
    oracleEndpoint,
    params,
    gasTransaction,
    curveType,
    ZapCurveType,
    curveStart,
    curveMultiplier,
    tokensForOracle,
    tokensForOwner,
    query
    // specifier
} = require('../utils');
const {
    zapDispatchAbi,
    zapArbiterAbi,
    zapTokenAbi,
    zapRegistryAbi,
    zapBondageAbi,
    addressSpacePointerAbi,
    zapDispatchStorageAbi,
    arbiterStorageAbi: zapArbiterStorageAbi,
    zapRegistryStorageAbi,
    bondageStorageAbi: zapBondageStorageAbi,
    currentCostAbi: zapCurrentCostAbi,
    // queryCallerAbi
} = require('../../config');

describe('Dispatch, path to "/src/api/contract/ZapDispatch"', () => {
    let accounts,
        bondageStorage,
        registryStorage,
        arbiterStorage,
        deployedZapToken,
        dispatchStorage,
        deployedZapRegistry,
        currentCostStorage,
        deployedZapBondage,
        deployedZapDispatch,
        deployedZapArbiter,
        addressZapDispatch,
        zapDispatchWrapper,
        // queryCaller,
        dispatchAbi;

    before(async () => {
        accounts = await webProvider.eth.getAccounts();
        assert.ok(true);
    });
    describe('ZapDispatch Wrapper', () => {

        beforeEach(function (done) {
            setTimeout(() => done(), 500);
        });

        it('should get instances of smart contract and bind their storages', async () => {
            try {
                const tokenAbi = require(join(__dirname, zapTokenAbi));
                dispatchAbi = require(join(__dirname, zapDispatchAbi));
                const arbiterAbi = require(join(__dirname, zapArbiterAbi));
                const registryAbi = require(join(__dirname, zapRegistryAbi));
                const bondageAbi = require(join(__dirname, zapBondageAbi));
                const dispatchStorageAbi = require(join(__dirname, zapDispatchStorageAbi));
                const arbiterStorageAbi = require(join(__dirname, zapArbiterStorageAbi));
                const registryStorageAbi = require(join(__dirname, zapRegistryStorageAbi));
                const bondageStorageAbi = require(join(__dirname, zapBondageStorageAbi));
                const currentCostAbi = require(join(__dirname, zapCurrentCostAbi));

                const spacePointer = getInstanceOfSmartContract(
                    require(join(__dirname, addressSpacePointerAbi))
                );

                // queryCaller = getInstanceOfSmartContract(
                //     require(join(__dirname, queryCallerAbi))
                // );

                [
                    bondageStorage,
                    registryStorage,
                    arbiterStorage,
                    deployedZapToken,
                    dispatchStorage
                ] = await Promise.all([
                    getNewSmartContract(bondageStorageAbi),
                    getNewSmartContract(registryStorageAbi),
                    getNewSmartContract(arbiterStorageAbi),
                    getNewSmartContract(tokenAbi),
                    getNewSmartContract(dispatchStorageAbi)
                ]);


                deployedZapRegistry = await getNewRegistryContract({
                    abiFile: registryAbi,
                    regStoreAddress: registryStorage.address
                });

                currentCostStorage = await getNewCurrentCostContract({
                    abiFile: currentCostAbi,
                    pointerAddress: spacePointer.address,
                    registryAddress: deployedZapRegistry.address
                });

                deployedZapBondage = await getNewBondageContract({
                    abiFile: bondageAbi,
                    pointerAddress: spacePointer.address,
                    bondStoreAddress: bondageStorage.address,
                    tokenAddress: deployedZapToken.address,
                    currentCostAddress: currentCostStorage.address
                });

                deployedZapDispatch = await getNewDispatchContract({
                    abiFile: dispatchAbi,
                    pointerAddress: spacePointer.address,
                    dispatchStoreAddress: dispatchStorage.address,
                    bondageAddress: deployedZapBondage.address
                });

                deployedZapArbiter = await getNewArbiterContract({
                    abiFile: arbiterAbi,
                    pointerAddress: spacePointer.address,
                    arbiterStoreAddress: arbiterStorage.address,
                    bondageAddress: deployedZapBondage.address
                });

                addressZapDispatch = deployedZapDispatch.address;

                await Promise.all([
                    bondageStorage.transferOwnership(deployedZapBondage.address, { from: accounts[0], gas: 6000000 }),
                    registryStorage.transferOwnership(deployedZapRegistry.address, { from: accounts[0], gas: 6000000 }),
                    arbiterStorage.transferOwnership(deployedZapArbiter.address, { from: accounts[0], gas: 6000000 }),
                    dispatchStorage.transferOwnership(deployedZapDispatch.address, { from: accounts[0], gas: 6000000 }),
                ]);

                const data = await Promise.all([
                    bondageStorage.owner({ from: accounts[0], gas: 6000000 }),
                    registryStorage.owner({ from: accounts[0], gas: 6000000 }),
                    arbiterStorage.owner({ from: accounts[0], gas: 6000000 }),
                    dispatchStorage.owner({ from: accounts[0], gas: 6000000 })
                ]);

                assert.equal(data[0]['0'], deployedZapBondage.address);
                assert.equal(data[1]['0'], deployedZapRegistry.address);
                assert.equal(data[2]['0'], deployedZapArbiter.address);
                assert.equal(data[3]['0'], deployedZapDispatch.address);
            } catch (err) {
                throw err;
            }
        });

        it('Should get instance of Zap Dispatch smart contract throw wrapper', () => {
            const wrapper = new ZapWrapper(eth);
            zapDispatchWrapper = wrapper.initClass({
                instanceClass,
                address: addressZapDispatch,
                abiPath: dispatchAbi.abi
            });
        });

        it('should call response1 function in Dispatch smart contract', async () => {
            try {
                await deployedZapRegistry.initiateProvider(
                    providerPublicKey,
                    providerTitle,
                    oracleEndpoint,
                    params,
                    { from: accounts[2], gas: gasTransaction } // from provider
                );

                await deployedZapRegistry.initiateProviderCurve(
                    oracleEndpoint,
                    curveType[ZapCurveType],
                    curveStart,
                    curveMultiplier,
                    { from: accounts[2], gas: gasTransaction } // from provider
                );

                await deployedZapToken.allocate(
                    accounts[0],
                    tokensForOwner,
                    { from: accounts[0], gas: gasTransaction }
                );

                await deployedZapToken.allocate(
                    accounts[2],
                    tokensForOracle,
                    { from: accounts[0], gas: gasTransaction }
                );

                await deployedZapToken.approve(
                    deployedZapBondage.address,
                    tokensForOracle,
                    { from: accounts[0], gas: gasTransaction }
                );

                await deployedZapToken.approve(
                    addressZapDispatch,
                    tokensForOracle,
                    { from: accounts[2], gas: gasTransaction }
                );

                await deployedZapBondage.bond(
                    accounts[2],
                    oracleEndpoint,
                    8,
                    { from: accounts[0], gas: gasTransaction }
                );

                await deployedZapArbiter.initiateSubscription(
                    accounts[2],
                    oracleEndpoint,
                    params,
                    providerPublicKey,
                    4,
                    { from: accounts[0], gas: gasTransaction }
                );

                const { dots } = await deployedZapBondage.getDots(
                    accounts[0],
                    accounts[2],
                    oracleEndpoint,
                    { from: accounts[0], gas: gasTransaction }
                );

                if (!dots.toNumber()) assert.ok(false);

                const contract = new web3.eth.Contract(dispatchAbi.abi, addressZapDispatch);
                const filter = new Promise((resolve, reject) => {
                    contract.events.Incoming({ fromBlock: 0, toBlock: 'latest' }, (err, res) => {
                        if (err) return reject(err);
                        if (res) return resolve(res);
                    });
                });

                const txHash = deployedZapDispatch.query(
                    accounts[2],
                    query,
                    oracleEndpoint,
                    params,
                    { from: accounts[0], gas: gasTransaction }
                );

                const promises = await Promise.all([
                    filter,
                    txHash
                ]);
                const [
                    {
                        returnValues: data,
                        event
                    }
                ] = promises;

                if(event !== 'Incoming') assert.ok(false);
                await deployedZapDispatch.respond1(
                    data.id,
                    'pum-tum-pum',
                    { from: data.provider } // from provider
                );
            } catch (err) {
                throw err;
            }
        });
    });
});