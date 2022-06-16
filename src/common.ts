import { ethers } from 'ethers'
import { readFileSync } from 'fs'
import {
  Token,
  ChainId,
  Fetcher,
  Route,
  Pair,
  Trade,
  TradeType,
  TokenAmount,
} from '@pancakeswap-libs/sdk-v2'
import Web3 from 'web3'

const web3 = new Web3(process.env.JSON_RPC!)

const provider = ethers.getDefaultProvider(process.env.ENTERPRISE_BLOXROUTE!)
const WBNB_ADDRESS = '0x10ed43c718714eb63d5aa57b78b54704e256024e'

var abi = JSON.parse(readFileSync(`${__dirname}/utils/abiUniswap.json`, 'utf8'))

const inter = new ethers.utils.Interface(abi)

function toHex(currencyAmount: any) {
  if (currencyAmount.toString().includes('e')) {
    let hexedAmount = currencyAmount.toString(16)
    return `0x${hexedAmount}`
  } else {
    let parsedAmount = parseInt(currencyAmount)
    let hexedAmount = parsedAmount.toString(16)
    return `0x${hexedAmount}`
  }
}

const priceImpact = async (tokenAddress: string, amount: string) => {
  try {
    let newToken = await Fetcher.fetchTokenData(
      ChainId.MAINNET,
      tokenAddress,
      provider
    )
    let WBNB = await Fetcher.fetchTokenData(
      ChainId.MAINNET,
      WBNB_ADDRESS,
      provider
    )

    let pair = await Fetcher.fetchPairData(newToken, WBNB)
    let route = new Route([pair], WBNB)

    let trade = new Trade(
      route,
      new TokenAmount(newToken, amount),
      TradeType.EXACT_INPUT
    )

    return trade.priceImpact.toFixed(5)
  } catch (error) {
    console.log(error)
  }
}

//reading data from the uniswap ABI
var tokenABI = JSON.parse(
  readFileSync(`${__dirname}/utils/abiUniswap.json`, 'utf8')
)

const tokenBalance = async (token: string) => {
  const tokenContract = new web3.eth.Contract(tokenABI, token)
  return tokenContract.methods.balanceOf(process.env.WALLET_ADDRESS!).call()
}

export { toHex, priceImpact, tokenBalance }
