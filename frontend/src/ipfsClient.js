// frontend/src/ipfsClient.js
import { create } from "ipfs-http-client";

// Kết nối đến node IPFS Desktop local
const ipfsClient = create({ url: "http://127.0.0.1:5001" });

export default ipfsClient;
