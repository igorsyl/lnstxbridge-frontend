import axios from 'axios';
import EventSource from 'eventsource';
import { boltzApi, SwapUpdateEvent } from '../constants';
import * as actionTypes from '../constants/actions';
import { Transaction, ECPair, address } from 'bitcoinjs-lib';
import { detectSwap, constructClaimTransaction } from 'boltz-core';
import {
  // toSatoshi,
  getNetwork,
  getHexBuffer,
  getFeeEstimation,
} from '../utils';

export const completeSwap = () => {
  return {
    type: actionTypes.COMPLETE_SWAP,
  };
};

export const initSwap = state => ({
  type: actionTypes.INIT_SWAP,
  payload: {
    webln: state.webln,
    base: state.base,
    quote: state.quote,
    baseAmount: state.baseAmount,
    quoteAmount: state.quoteAmount,
    keys: state.keys,
    pair: state.pair,
    preimage: state.preimage,
    preimageHash: state.preimageHash,
  },
});

export const setSwapInvoice = (invoice, error) => ({
  type: actionTypes.SET_SWAP_INVOICE,
  payload: {
    invoice,
    error,
  },
});

export const setSwapStatus = status => ({
  type: actionTypes.SET_SWAP_STATUS,
  payload: status,
});

export const swapResponse = (success, response) => ({
  type: actionTypes.SWAP_RESPONSE,
  payload: {
    success,
    response,
  },
});

export const swapRequest = () => ({
  type: actionTypes.SWAP_REQUEST,
});

export const startSwap = (swapInfo, cb) => {
  const url = `${boltzApi}/createswap`;
  let { pair, invoice, keys, preimageHash, quoteAmount, baseAmount } = swapInfo;

  // Trim the "lightning:" prefix, that some wallets add in front of their invoices, if it exists
  if (invoice.slice(0, 10) === 'lightning:') {
    invoice = invoice.slice(10);
  }
  console.log('atomic swap swapInfo', pair, swapInfo);

  let reqobj;
  if (pair.id == 'BTC/STX' && invoice.toLowerCase().slice(0, 4) !== 'lnbc') {
    reqobj = {
      type: 'submarine',
      pairId: pair.id,
      orderSide: pair.orderSide,
      claimAddress: invoice,
      refundPublicKey: keys.publicKey,
      preimageHash,
      requestedAmount: parseInt(quoteAmount * 1000000) + '',
      baseAmount: baseAmount,
      quoteAmount: quoteAmount,
    };
  } else {
    reqobj = {
      type: 'submarine',
      pairId: pair.id,
      orderSide: pair.orderSide,
      invoice: invoice,
      refundPublicKey: keys.publicKey,
    };
  }

  return dispatch => {
    dispatch(swapRequest());
    console.log('submarine swap request: refundPublicKey', keys.publicKey);
    axios
      .post(url, reqobj)
      .then(response => {
        console.log('1esponse data ', response.data);
        dispatch(swapResponse(true, response.data));
        console.log('2response data ', response.data);
        startListening(dispatch, response.data.id, cb);
        console.log('3response data ', response.data);
        cb();
      })
      .catch(error => {
        console.log('catch error: ', error);
        const message = error.response.data.error;

        window.alert(`Failed to execute swap: ${message}`);
        dispatch(swapResponse(false, message));
      });
  };
};

const handleSwapStatus = (data, source, dispatch, callback) => {
  const status = data.status;
  console.log('handleSwapStatus ', data);

  switch (status) {
    case SwapUpdateEvent.TransactionConfirmed:
      dispatch(
        setSwapStatus({
          pending: true,
          message: 'Waiting for invoice to be paid...',
        })
      );
      break;

    case SwapUpdateEvent.InvoiceFailedToPay:
      source.close();
      dispatch(
        setSwapStatus({
          error: true,
          pending: false,
          message: 'Could not pay invoice. Please refund your coins.',
        })
      );
      break;

    case SwapUpdateEvent.SwapExpired:
      source.close();
      dispatch(
        setSwapStatus({
          error: true,
          pending: false,
          message: 'Swap expired. Please refund your coins.',
        })
      );
      break;

    case SwapUpdateEvent.InvoicePaid:
    case SwapUpdateEvent.TransactionClaimed:
      source.close();
      callback();
      break;

    case SwapUpdateEvent.ASTransactionMempool:
    case SwapUpdateEvent.TransactionMempool:
      console.log('got mempool');
      // eslint-disable-next-line no-case-declarations
      let swapStatusObj = {
        pending: true,
        message: 'Transaction is in mempool...',
      };
      if (data.transaction) {
        swapStatusObj.transaction = data.transaction;
      }
      dispatch(setSwapStatus(swapStatusObj));
      break;

    case SwapUpdateEvent.ASTransactionConfirmed:
      console.log('got asconfirmed');
      dispatch(
        setSwapStatus({
          pending: true,
          message: 'Atomic Swap is ready',
        })
      );
      break;

    case SwapUpdateEvent.TransactionFailed:
      dispatch(
        setSwapStatus({
          error: true,
          pending: false,
          message:
            'Atomic Swap coins could not be sent. Please refund your coins.',
        })
      );
      break;

    default:
      console.log(`Unknown swap status: ${JSON.stringify(data)}`);
      break;
  }
};

export const startListening = (dispatch, swapId, callback) => {
  const source = new EventSource(`${boltzApi}/streamswapstatus?id=${swapId}`);

  dispatch(
    setSwapStatus({
      pending: true,
      message: 'Waiting for one confirmation...',
    })
  );

  source.onerror = () => {
    source.close();

    console.log(`Lost connection to Boltz`);
    const url = `${boltzApi}/swapstatus`;

    const interval = setInterval(() => {
      console.log('interval');
      axios
        .post(url, {
          id: swapId,
        })
        .then(statusReponse => {
          clearInterval(interval);

          console.log(`Reconnected to Boltz`);

          startListening(dispatch, swapId, callback);
          handleSwapStatus(statusReponse.data, source, dispatch, callback);
        });
    }, 1000);
  };

  source.onmessage = event => {
    // console.log('onmessage: ', event);
    handleSwapStatus(JSON.parse(event.data), source, dispatch, callback);
  };
};

// atomic swap claim bitcoin utxo
export const claimSwap = (dispatch, nextStage, swapInfo, swapResponse) => {
  dispatch(
    getFeeEstimation(feeEstimation => {
      console.log(
        'getFeeEstimation swapInfo.quote',
        swapInfo.quote,
        ' fee set to 0'
      );
      console.log('claimswap:: ', swapInfo, swapResponse, feeEstimation);

      // this is not launched automatically anymore, user needs to click it from the GUI.
      // claimStx(swapInfo,swapResponse, nextStage)

      // TODO: prepare a claim tx for the user on Stacks!!!
      // just launch the wallet so that user can run and claim the stx

      const claimTransaction = getClaimTransaction(
        swapInfo,
        swapResponse,
        feeEstimation
      );

      console.log('reverseactions.124 claimtx: ', claimTransaction);
      dispatch(
        broadcastClaimTransaction(
          swapInfo.quote,
          claimTransaction.toHex(),
          () => {
            console.log('swapactions.253 dispatch?', swapResponse);
            // dispatch(reverseSwapResponse(true, swapResponse));
            nextStage();
          }
        )
      );
    })
  );
};

const getClaimTransaction = (swapInfo, response, feeEstimation) => {
  console.log('getClaimTransaction:: ', swapInfo, response, feeEstimation);

  const redeemScript = getHexBuffer(response.redeemScript);
  const lockupTransaction = Transaction.fromHex(response.transactionHex);

  return constructClaimTransaction(
    [
      {
        ...detectSwap(redeemScript, lockupTransaction),
        redeemScript,
        txHash: lockupTransaction.getHash(),
        preimage: getHexBuffer(swapInfo.preimage),
        keys: ECPair.fromPrivateKey(getHexBuffer(swapInfo.keys.privateKey)),
      },
    ],
    address.toOutputScript(swapInfo.address, getNetwork(swapInfo.quote)),
    // feeEstimation[swapInfo.quote],
    0,
    false
  );
};

const broadcastClaimTransaction = (currency, claimTransaction, cb) => {
  const url = `${boltzApi}/broadcasttransaction`;
  return dispatch => {
    axios
      .post(url, {
        currency,
        transactionHex: claimTransaction,
      })
      .then(() => cb())
      .catch(error => {
        const message = error.response.data.error;

        window.alert(`Failed to broadcast claim transaction: ${message}`);
        // dispatch(reverseSwapResponse(false, message));
        dispatch();
      });
  };
};
