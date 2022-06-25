import path from "path"

import dotenv from "dotenv"
dotenv.config({path:path.resolve(__dirname,".env")})

import config from "./config" 
import express from "express"
import router from "./router"
const app = express()

app.listen(config.express.port,()=>{
    console.log(`began listening on port: ${config.express.port}`)
})

app.use(router)