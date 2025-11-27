// frontend/src/ipfsClient.js
import { create } from "ipfs-http-client";

// Kết nối đến node IPFS Desktop local
const ipfsClient = create({ url: "http://160.191.175.191:5001" });

export default ipfsClient;
