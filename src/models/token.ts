import { Schema, model } from 'mongoose'

// Token Interface
interface TokenInterface {
  token: string
}

// Token Schema
const orderSchema = new Schema<TokenInterface>(
  {
    token: { type: String, required: true, unique: true },
  },
  {
    timestamps: true,
  }
)

const Token = model<TokenInterface>('tokens', orderSchema, 'tokens')

export { Token }
