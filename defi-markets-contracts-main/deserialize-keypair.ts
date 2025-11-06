import { Keypair } from "@solana/web3.js";
import { readFileSync } from "fs";
import path from "path";

function toBase58(bytes: Uint8Array): string {
    const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const BASE = 58;
    if (bytes.length === 0) return "";
    let zeros = 0;
    while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
    const size = Math.ceil((bytes.length - zeros) * 138 / 100) + 1;
    const b58 = new Uint8Array(size);
    let length = 0;
    for (let i = zeros; i < bytes.length; i++) {
        let carry = bytes[i];
        let j = 0;
        for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
            carry += 256 * b58[k];
            b58[k] = carry % BASE;
            carry = Math.floor(carry / BASE);
        }
        length = j;
    }
    let it = size - length;
    while (it < size && b58[it] === 0) it++;
    let str = "";
    for (let i = 0; i < zeros; i++) str += "1";
    for (; it < size; ++it) str += ALPHABET[b58[it]];
    return str;
}

function assertByteArray(values: unknown): asserts values is number[] {
    if (!Array.isArray(values)) {
        throw new Error("JSON must be an array of numbers");
    }
    if (!values.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
        throw new Error("Array must contain only integers between 0 and 255");
    }
}

function loadSecretKeyFromJson(jsonString: string): Uint8Array {
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonString);
    } catch (e) {
        throw new Error("Failed to parse JSON: " + (e as Error).message);
    }
    assertByteArray(parsed);
    const bytes = new Uint8Array(parsed);
    if (bytes.length !== 64) {
        throw new Error("Secret key must be 64 bytes long (ed25519 expanded secret key)");
    }
    return bytes;
}

function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error("Usage: ts-node deserialize-keypair.ts <path-to-json> | --json '<[...64 numbers...]>'");
        console.error("- Provide a file path to a JSON array or pass the array via --json");
        process.exit(1);
    }

    let jsonContent: string;
    if (args[0] === "--json") {
        if (!args[1]) {
            throw new Error("Missing JSON string after --json");
        }
        jsonContent = args[1];
    } else {
        const filePath = path.resolve(process.cwd(), args[0]);
        jsonContent = readFileSync(filePath, "utf8");
    }

    const secretKey = loadSecretKeyFromJson(jsonContent);
    const keypair = Keypair.fromSecretKey(secretKey);

    // Output minimal, safe information
    console.log("Public Key:", keypair.publicKey.toBase58());
    console.log("Secret Key (JSON):", JSON.stringify(Array.from(secretKey)));
    console.log("Secret Key (Base58 - import into Phantom):", toBase58(secretKey));
}

main();


