import React from 'react';
import Switch from 'react-switch';
import PropTypes from 'prop-types';
import injectSheet from 'react-jss';
import Link from '../../../components/link';
import View from '../../../components/view';
import { getCurrencyName, getExplorer } from '../../../utils';

import { Button as SButton, Box } from '@stacks/ui'
import { MdFileDownload } from 'react-icons/md';

import lightningPayReq from 'bolt11';
import { StacksTestnet, StacksMainnet, StacksMocknet } from '@stacks/network';
import { openContractCall } from '@stacks/connect';
import {
  bufferCV,
  // makeStandardSTXPostCondition,
  FungibleConditionCode,
  PostConditionMode,
  // createSTXPostCondition,
  parsePrincipalString,
  StacksMessageType,
  PostConditionType
} from '@stacks/transactions';

import bigInt from 'big-integer';
import { BN } from 'bn.js';

let mocknet = new StacksMocknet();
// mocknet.coreApiUrl = 'http://localhost:3999';
const testnet = new StacksTestnet();
const mainnet = new StacksMainnet();
let network = mocknet

const styles = () => ({
  wrapper: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: '30px',
    paddingLeft: '20px',
    paddingRight: '20px',
    '@media (max-width: 425px)': {
      fontSize: '16px',
    },
  },
  sbuttoncl: {
    margin: 'auto',
    width: 'fit-content',
    padding: '15px',
  },
  switch: {
    paddingLeft: '10px',
  },
});

const claimStx = async (
  swapInfo,
  swapResponse) => {

  let contractAddress = swapResponse.lockupAddress.split(".")[0].toUpperCase();
  let contractName = swapResponse.lockupAddress.split(".")[1]
  console.log("claimStx ", contractAddress, contractName)

  let preimage = swapInfo.preimage;
  let amount = swapResponse.onchainAmount;
  let timeLock = swapResponse.timeoutBlockHeight;

    // ${getHexString(preimage)}
  console.log(`Claiming ${amount} Stx with preimage ${preimage} and timelock ${timeLock}`);

  // this is wrong
  // let decimalamount = parseInt(amount.toString(),16)
  console.log("amount, decimalamount: ", amount)
  // let smallamount = decimalamount
  // .div(etherDecimals)
  // let smallamount = amount.toNumber();
  let smallamount = parseInt(amount / 100) + 1
  console.log("smallamount: " + smallamount)

  // // Add an optional post condition
  // // See below for details on constructing post conditions
  // const postConditionAddress = contractAddress;
  const postConditionCode = FungibleConditionCode.GreaterEqual;
  // // new BigNum(1000000);
  const postConditionAmount = new BN(100000);
  // const postConditions = [
  //   makeStandardSTXPostCondition(postConditionAddress, postConditionCode, postConditionAmount),
  // ];

  // With a contract principal
  // const contractAddress = 'SPBMRFRPPGCDE3F384WCJPK8PQJGZ8K9QKK7F59X';
  // const contractName = 'test-contract';

  const postConditions = [
    createSTXPostCondition(
      // contractAddress,
      // contractName,
      swapResponse.lockupAddress,
      postConditionCode,
      postConditionAmount
    )
  ];

  console.log("postConditions: " + contractAddress, contractName, postConditionCode, postConditionAmount)

  let swapamount = smallamount.toString(16).split(".")[0] + "";
  let paddedamount = swapamount.padStart(32, "0");
  let paddedtimelock = timeLock.toString(16).padStart(32, "0");
  console.log("amount, timelock ", smallamount, swapamount, paddedamount, paddedtimelock);

  // (claimStx (preimage (buff 32)) (amount (buff 16)) (claimAddress (buff 42)) (refundAddress (buff 42)) (timelock (buff 16)))
  const functionArgs = [
    // bufferCV(Buffer.from('4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a', 'hex')),
    bufferCV(Buffer.from(preimage,'hex')),
    bufferCV(Buffer.from(paddedamount,'hex')),
    bufferCV(Buffer.from('01','hex')),
    bufferCV(Buffer.from('01','hex')),
    bufferCV(Buffer.from(paddedtimelock,'hex')),
  ];
  console.log("stacks cli claim.154 functionargs: " + JSON.stringify(functionArgs));

  // const functionArgs = [
  //   bufferCV(preimageHash),
  //   bufferCV(Buffer.from('00000000000000000000000000100000','hex')),
  //   bufferCV(Buffer.from('01','hex')),
  //   bufferCV(Buffer.from('01','hex')),
  //   bufferCV(Buffer.from('000000000000000000000000000012b3','hex')),
  // ];

  const txOptions = {
    contractAddress: contractAddress,
    contractName: contractName,
    functionName: 'claimStx',
    functionArgs: functionArgs,
    // validateWithAbi: true,
    network,
    postConditionMode: PostConditionMode.Allow,
    // postConditions,
    // anchorMode: AnchorMode.Any,
    onFinish: data => {
      console.log('Stacks claim onFinish:', JSON.stringify(data));
      // reverseSwapResponse(true, swapResponse);
      // nextStage();
    },
    onCancel: data => {
      console.log('Stacks claim onCancel:', JSON.stringify(data));
      // reverseSwapResponse(false, swapResponse);
      // nextStage();      
    }
  };

  // this.toObject(txOptions)
  // console.log("stackscli claim.170 txOptions: " + JSON.stringify(txOptions));
  await openContractCall(txOptions);

  // const transaction = await makeContractCall(txOptions);
  // return broadcastTransaction(transaction, network);
 
  

  // this is from connect
  // return await openContractCall(txOptions);

  // return this.etherSwap.lock(preimageHash, claimAddress, timeLock, {
  //   value: amount,
  //   gasPrice: await getGasPrice(this.etherSwap.provider),
  // });
}

const createSTXPostCondition = (principal, conditionCode, amount) => {
  if (typeof principal === 'string') {
      principal = parsePrincipalString(principal);
  }
  return {
      type: StacksMessageType.PostCondition,
      conditionType: PostConditionType.STX,
      principal,
      conditionCode,
      amount: intToBN(amount, false),
  };
}
const intToBytes = (value, signed, byteLength) => {
  return intToBN(value, signed).toArrayLike(Buffer, 'be', byteLength);
}
const intToBN = (value, signed) => {
  const bigInt = intToBigInt(value, signed);
  return new BN(bigInt.toString());
}
const intToBigInt = (value, signed) => {
  if (typeof value === 'number') {
      if (!Number.isInteger(value)) {
          throw new RangeError(`Invalid value. Values of type 'number' must be an integer.`);
      }
      // console.log("156")
      // return 157;
      return bigInt(value);
  }
  if (typeof value === 'string') {
      if (value.toLowerCase().startsWith('0x')) {
          let hex = value.slice(2);
          hex = hex.padStart(hex.length + (hex.length % 2), '0');
          value = Buffer.from(hex, 'hex');
      }
      else {
          try {
            // return 168;
              return bigInt(value);
          }
          catch (error) {
              if (error instanceof SyntaxError) {
                  throw new RangeError(`Invalid value. String integer '${value}' is not finite.`);
              }
          }
      }
  }
  if (typeof value === 'bigint') {
      return value;
  }
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
      if (signed) {
          const bn = new BN(value, 'be').fromTwos(value.byteLength * 8);
          // return 184;
          return bigInt(bn.toString());
      }
      else {
          // return 188;
          return bigInt(new BN(value, 'be').toString());
      }
  }
  if (value instanceof BN || BN.isBN(value)) {
      // return 193;
      return bigInt(value.toString());
  }
  throw new TypeError(`Invalid value type. Must be a number, bigint, integer-string, hex-string, BN.js instance, or Buffer.`);
}

class LockingFunds extends React.Component {
  constructor() {
    super();

    this.state = {
      checked: false,
    };
  }

  render() {
    const { classes, swapInfo, swapResponse, setAllowZeroConf } = this.props;

    const link = swapResponse
      ? `${getExplorer(swapInfo.quote)}/txid/0x${swapResponse.transactionId}`
      : '#0';

    return (
      <View className={classes.wrapper}>
        <p className={classes.text}>
          Stacks.Swap is locking the <b>{getCurrencyName(swapInfo.quote)}</b> that you
          are ought to receive, this is important to keep the swap atomic and
          trustless. It might take up to 10 minutes.
          <br />
          <br />
          <Link to={link} text={'Click here'} /> to see the lockup transaction.
          <br />
          <br />
          Once lockup is complete and you have started paying the HODL invoice, you can trigger 
          claimStx contract call to finalize the swap and receive your STX.
          {/* If you are #reckless and impatient you can accept the 0-conf
          transaction:
          <Switch
            className={classes.switch}
            checked={this.state.checked}
            onChange={checked => {
              setAllowZeroConf(checked);
              this.setState({ checked });
            }}
            width={48}
            height={20}
            handleDiameter={30}
            checkedIcon={false}
            uncheckedIcon={false}
            onColor="#86d3ff"
            onHandleColor="#2693e6"
            boxShadow="0px 1px 5px rgba(0, 0, 0, 0.6)"
            activeBoxShadow="0px 0px 1px 10px rgba(0, 0, 0, 0.2)"
          /> */}
        </p>
        <SButton
            size="large"
            pl="base-tight"
            pr={'base'}
            py="tight"
            fontSize={2}
            mode="primary"
            position="relative"
            className={classes.sbuttoncl}
            // ref={ref}
            onClick={() => claimStx(swapInfo, swapResponse)}
            // onClick={refundStx}
            borderRadius="10px"
            // {...rest}
            >
            <Box
              as={MdFileDownload}
              // transform={isSend ? 'unset' : 'scaleY(-1)'}
              size={'16px'}
              mr={'2px'}
            />
            <Box as="span" ml="2px" fontSize="large">
              Claim STX
            </Box>
          </SButton>
      </View>
    );
  }
}

LockingFunds.propTypes = {
  swapInfo: PropTypes.object.isRequired,
  swapResponse: PropTypes.object.isRequired,
  setAllowZeroConf: PropTypes.func.isRequired,
  classes: PropTypes.object.isRequired,
};

export default injectSheet(styles)(LockingFunds);
