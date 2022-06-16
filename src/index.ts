import { readFileSync } from 'fs'
import { ethers } from 'ethers'
import Websocket from 'ws'
import cron from 'node-cron'

import { swapExactTokensForETHSupportingFeeOnTransferTokens } from './uniswap/sell'
import {
  ADDITIONAL_GAS_SELL,
  MIN_PRICE_IMPACT,
  TOKENS_TO_MONITOR,
} from './setup/setup'
import { priceImpact, tokenBalance } from './common'
import { MongoClient } from 'mongodb'

const ws = new Websocket(process.env.ENTERPRISE_BLOXROUTE!, {
  cert: readFileSync(`src/utils/certs/external_gateway_cert.pem`),

  key: readFileSync(`src/utils/certs/external_gateway_key.pem`),
  rejectUnauthorized: false,
})

const PANCAKE_ROUTER = '0x10ed43c718714eb63d5aa57b78b54704e256024e'
const methodsExclusion = ['0x18cbafe5', '0x0d7f0754', '0x791ac947']
const provider = ethers.getDefaultProvider(process.env.JSON_RPC)

function subscribe() {
  ws.send(
    `{"jsonrpc": "2.0", "id": 1, "method": "subscribe", "params": ["newTxs", {"duplicates":false,"include": ["tx_hash", "tx_contents.to", "tx_contents.from", "tx_contents.value", "tx_contents.gas_price", "tx_contents.gas", "tx_contents.input"],"filters":"method_id in [18cbafe5,0d7f0754,791ac947]"}]}`
  )
}

let dbTokensToMonitor: string[] = []

const dbListener = async () => {
  // Connect to desired db
  const client = new MongoClient(process.env.TAG_BOT_URL!)

  console.log(process.env.TAG_BOT_URL)

  await client
    .connect()
    .then(() => {
      console.log('Succesfully connected to DB')
    })
    .catch((error) => {
      console.log('Error connecting to DB ', error)
    })
  const db = client.db('test')
  const tokensCollection = db.collection('tokens')

  // create a watch instance

  let watcher = tokensCollection.watch()

  // Process received change
  watcher.on('change', (change: { fullDocument: any }) => {
    console.log('Change in db *******')
    console.log(change)
    dbTokensToMonitor.push(change.fullDocument!.toLowerCase())
  })
}

let latestNonce = 0

/**
 *
 * @returns walletNonce of the walletAddress
 */
const walletNonce = async () => {
  cron.schedule('*/10 * * * * *', async () => {
    await provider
      .getTransactionCount(process.env.WALLET_ADDRESS!)
      .then((nonce) => {
        latestNonce = nonce
      })
      .catch((error) => {
        console.log('Error getting nonce ', error)
      })
  })
}

const main = async () => {
  //check if the prvided constants are provided in the .env
  if (
    !process.env.JSON_RPC &&
    !process.env.WS_BLOXROUTE &&
    !process.env.WALLET_ADDRESS &&
    !process.env.PRIVATE_KEY &&
    !process.env.MONGO_DB_URL &&
    !process.env.BLOXROUTE_AUTHORIZATION_HEADER
  ) {
    throw new Error(
      'APP_NAME && JSON_RPC && WS_BLOXROUTE && WALLET_ADDRESS && PRIVATE_KEY && MONGO_DB_URL && BLOXROUTE_AUTHORIZATION_HEADER  Must be defined in your .env FILE'
    )
  }

  try {
    // dbListener()

    //reading data from the uniswap ABI
    var abi = JSON.parse(
      readFileSync(`${__dirname}/utils/abiUniswap.json`, 'utf8')
    )

    const inter = new ethers.utils.Interface(abi)

    const mempoolData = async (notification: string) => {
      try {
        let JsonData = await JSON.parse(notification)
        let tx = JsonData.params.result

        if (!methodsExclusion.includes(tx.txContents.input)) {
          let routerAddress = tx.txContents.to.toLowerCase()

          //only concentrate with transactions to the pancake swap router
          if (routerAddress == PANCAKE_ROUTER) {
            const decodedInput = inter.parseTransaction({
              data: tx.txContents.input,
            })

            let gasLimit = parseInt(tx.txContents.gas, 16)
            let gasPrice =
              parseInt(tx.txContents.gasPrice, 16) + ADDITIONAL_GAS_SELL
            let path: Array<string> = decodedInput.args.path
            let methodName = decodedInput.name
            let token = decodedInput.args.path[0]

            console.log('Here is our token:', token)

            if (dbTokensToMonitor.includes(token.toLowerCase())) {
              gasPrice = gasPrice + ADDITIONAL_GAS_SELL
              const targetTokenAmount = parseInt(
                decodedInput.args.amountIn._hex,
                16
              ).toString()

              const impact: any = await priceImpact(token, targetTokenAmount)

              if (impact && impact > MIN_PRICE_IMPACT) {
                let amountIn = await tokenBalance(token)
                //sell
                await swapExactTokensForETHSupportingFeeOnTransferTokens(
                  amountIn,
                  1,
                  path,
                  gasPrice,
                  gasLimit,
                  latestNonce
                )
              }
            }
          }
        }
      } catch (error) {
        console.log('Error: ', error)
      }
    }

    let stateOn = true

    // Call the method processMempooldata that process the transaction data received from the blockchain provider
    const processMempooldata = (nextNotification: string) => {
      if (stateOn == true) {
        mempoolData(nextNotification)
      }
    }

    ws.on('open', subscribe)
    ws.on('message', processMempooldata)
    ws.on('close', () => {
      console.log('Websocket closedd. Trying to reconnect......')
    })
  } catch (error) {
    console.log(error)
  }
}

main()
