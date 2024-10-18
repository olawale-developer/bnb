const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

// Queue implementation (Same as before)
const queue = [];
let isProcessing = false;
const delayBetweenRequests = 1000; // 1 second delay

function addToQueue(fn) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    processQueue();
  });
}

async function processQueue() {
  if (isProcessing || queue.length === 0) return;

  const { fn, resolve, reject } = queue.shift();
  isProcessing = true;

  try {
    const result = await fn();
    resolve(result);
  } catch (error) {
    reject(error);
  }

  setTimeout(() => {
    isProcessing = false;
    processQueue();  // Continue processing the next request in the queue after delay
  }, delayBetweenRequests);
}

// Function to monitor Binance transactions
async function monitorBinanceTransactions(wallet_address, acct_number, bank_name, bank_code, receiver_name, db, transac_id, timers, crypto_sent, receiver_amount, current_rate, asset_price) {
  const url = `${process.env.BASE_URL}?module=account&action=txlist&address=${wallet_address}&startblock=0&endblock=99999999&sort=desc&apikey=${process.env.apiKey}`;

  return await addToQueue(async () => {
    try {
      const response = await axios.get(url);
      const transactions = response.data?.result || [];
      console.log(`The lastTransaction is: ${transactions}`);

      if (transactions.length === 0) {
        console.log("No transactions found for this address.");
        return;
      }

      timers[transac_id]['lastTransaction'] = transactions[0];
      timers[transac_id]['transactionDate'] = new Date(timers[transac_id]['lastTransaction'].timeStamp * 1000);

      // Compare the transaction time with the current time and 10 minutes from now
      if (timers[transac_id]['transactionDate'] >= timers[transac_id]['currentTime'] && timers[transac_id]['transactionDate'] <= timers[transac_id]['futureTime']) {
        const transactionAmount = timers[transac_id]['lastTransaction'].value / 1e18;
        const actualAmount = transactionAmount.toFixed(8);
        const expectedAmount = crypto_sent.replace(/[^0-9.]/g, "");

        if (actualAmount == expectedAmount) {
          const nairaAmount = receiver_amount.replace(/[^0-9.]/g, "");
          const amount_sent = nairaAmount.split(".")[0];
          clearInterval(timers[transac_id]['monitoringTimer']);
          clearTimeout(timers[transac_id]['Timeout']);
          mongoroApi(acct_number, bank_name, bank_code, receiver_name, db, transac_id, amount_sent);
          setBinanceWalletFlag(wallet_address, db);
          actualAmounts(transac_id, actualAmount, amount_sent, db);
        } else {
          handleSmallAmount(actualAmount, expectedAmount, current_rate, transac_id, acct_number, bank_name, bank_code, receiver_name, db, wallet_address, timers, asset_price);
        }
      }
    } catch (error) {
      console.error("Error fetching transactions:", error.message);
    }
  });
}




function monitoringTimer(wallet_address, acct_number, bank_name, bank_code, receiver_name, db, transac_id, timers, crypto_sent, receiver_amount, current_rate,asset_price) {
    timers[transac_id]['monitoringTimer'] = setInterval(() => {
       monitorBinanceTransactions(wallet_address, acct_number, bank_name, bank_code, receiver_name, db, transac_id, timers, crypto_sent, receiver_amount, current_rate,asset_price)
    }, 60000);  // 1 minutes = 60,000 milliseconds
}


function  handleSmallAmount(actualAmount, expectedAmount, current_rate, transac_id, acct_number, bank_name, bank_code, receiver_name, db, wallet_address, timers, asset_price) {
 const rate = current_rate.replace(/[^0-9.]/g, "");
const assetPrice = asset_price.replace(/[^0-9.]/g, "");
const  dollarActualAmount = actualAmount * assetPrice
const naira = dollarActualAmount * rate;
const  dollarExpectedamount = expectedAmount * assetPrice   

  let transactionFee;
   console.log('this function is working perfectly')
  if (naira <= 100000) {
    transactionFee = 500;
  } else if (naira <= 1000000) {
    transactionFee = 1000;
  } else if (naira <= 2000000) {
    transactionFee = 1500;
  }

  const num = 50
  const fifty = Number(num).toFixed(8)
  
  const nairaValue = naira - transactionFee;
  if (nairaValue > transactionFee) {
    if (dollarActualAmount <= fifty) {
      const max = Number(dollarActualAmount) + 5
      const maxAmount = max.toFixed(8)
      const min = Number(dollarActualAmount) - 5
      const minAmount = min.toFixed(8)
      console.log('maxAmount:',maxAmount)
      console.log("minAmount:", minAmount)
      console.log("dollarActualAmount:", dollarActualAmount)
      console.log("expectedamount:", dollarExpectedamount)
      if (dollarExpectedamount <= maxAmount && dollarExpectedamount >= minAmount) {
        console.log('for smaller money ')
           handleAmountCal(wallet_address, acct_number, bank_name, bank_code, receiver_name, db, transac_id, timers, actualAmount,nairaValue)
      }else {
            console.log('This amount is too less for the transaction.');
       }

    } else if (dollarActualAmount > fifty) {
      const max = Number(dollarActualAmount) * 1.1
      const maxAmount = max.toFixed(8) 
      const min = Number(dollarActualAmount) * 0.9
      const minAmount = min.toFixed(8)

      if (dollarExpectedamount <= maxAmount && dollarExpectedamount >= minAmount) {
         console.log('for bigger money ')
       handleAmountCal(wallet_address, acct_number, bank_name, bank_code, receiver_name, db, transac_id, timers, actualAmount,nairaValue)
      } else {
            console.log('This amount is too big for the transaction.');
       }
  }
  } else {
    console.log('This amount is too small for the transaction.');
  }
}


function handleAmountCal(wallet_address, acct_number, bank_name, bank_code, receiver_name, db, transac_id, timers, actualAmount,nairaValue) {
  
    const strNairaValue = nairaValue.toString();
    const amount = strNairaValue.replace(/[^0-9.]/g, "");
    const amt_sent = amount.split(".")[0];
    const amount_sent = `₦${amt_sent.toLocaleString()}`;

      clearTimeout(timers[transac_id]['Timeout']);
    clearInterval(timers[transac_id]['monitoringTimer'])
    mongoroApi(acct_number, bank_name, bank_code, receiver_name, db, transac_id, amt_sent);
    actualAmounts(transac_id, actualAmount, amount_sent, db);
    setBinanceWalletFlag(wallet_address, db);

}


function actualAmounts(transac_id, actualAmount,amount_sent,db) {
  const user = {
    actual_crypto: actualAmount,
    Settle_amount_sent: amount_sent
   };
     db.query(`UPDATE 2settle_transaction_table SET ? WHERE transac_id = ?`, [user, transac_id]);
}

async function mongoroApi(acct_number, bank_name, bank_code, receiver_name,db,transac_id,amount_sent) {
    console.log(receiver_name)
    const user = {
        accountNumber: acct_number,
        accountBank: bank_code,
        bankName: bank_name,
        amount: amount_sent,
        saveBeneficiary: false,
        accountName: receiver_name,
        narration: "Sirftiech payment",
        currency: "NGN",
        callbackUrl: "http://localhost:3000/payment/success",
        debitCurrency: "NGN",
        pin: "111111"
    };
    
    try {
        const response = await fetch('https://api-biz-dev.mongoro.com/api/v1/openapi/transfer', {
            method: 'POST', // HTTP method
            headers: {
                'Content-Type': 'application/json',    // Content type
                'accessKey': '117da1d3e93c89c3ca3fbd3885e5a6e29b49001a',
                'token': '75bba1c960a6ce7b608e001d9e167c44a9713e40'
            },
            body: JSON.stringify(user) // Data to be sent
        });

        const responseData = await response.json();

        if (!response.ok) {
            
         customerSupport(acct_number, bank_name,  receiver_name,transac_id,amount_sent)
            
        //    throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);

        }
        if (responseData) {
            console.log('working baby')
             const user = { status: 'Successful' };
         db.query(`UPDATE 2settle_transaction_table SET ? WHERE transac_id = ?`, [user, transac_id]);
        }
        console.log('Transaction successful:', responseData);
    } catch (error) {
      console.error('Error:', error);
      customerSupport(acct_number, bank_name,  receiver_name,transac_id,amount_sent)

    }
}

function setBinanceWalletFlag(wallet_address,db) {
     const user = { ethereum_flag: 'true' };
  db.query(`UPDATE 2Settle_walletAddress SET ? WHERE tron_wallet = ?`, [user, wallet_address]);
  console.log(`this wallet address is release ${wallet_address}`)
}

function customerSupport(acct_number, bank_name,  receiver_name,transac_id,amount_sent) {
       const messageDetails = [
          `Name: ${receiver_name}`,
          `Bank name: ${bank_name}`,
          `Account number: ${acct_number}`,
          `Receiver Amount: ${amount_sent}`,
        ];
        const menuOptions = [
          [{ text: 'Successful', callback_data: `Transaction_id: ${transac_id} Successful` }]
        ];

            const message = `${messageDetails.join('\n')}}`
              axios.post('http://50-6-175-42.bluehost.com:5000/message', {
                message: message,
                menuOptions: menuOptions,
             }, { timeout: 10000 })  // set timeout to 10 seconds (10000 ms))
            
}

module.exports = {
  setBinanceWalletFlag,
    monitoringTimer
}
