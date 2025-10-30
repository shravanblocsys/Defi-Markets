import { Keypair } from "@solana/web3.js";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

function isHex(str: string): boolean {
    return /^[0-9a-fA-F]+$/.test(str);
}

function isBase58(str: string): boolean {
    // Basic base58 check (no 0,O,I,l)
    return /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(str);
}

function parsePrivateKey(input: string): Uint8Array {
    const trimmed = input.trim();

    // 1) Try JSON array
    if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || trimmed.includes(",")) {
        try {
            const arr = JSON.parse(trimmed);
            if (Array.isArray(arr) && arr.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
                return new Uint8Array(arr as number[]);
            }
        } catch (_) {
            // Fall through to CSV parse
            const csv = trimmed.split(/[\s,]+/).filter(Boolean);
            if (csv.length > 0 && csv.every((t) => /^[0-9]+$/.test(t))) {
                const nums = csv.map((t) => Number(t));
                if (nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
                    return new Uint8Array(nums);
                }
            }
        }
    }

    // 2) Try hex string
    if (isHex(trimmed)) {
        if (trimmed.length % 2 !== 0) {
            throw new Error("Hex private key must have even length");
        }
        const bytes = new Uint8Array(trimmed.length / 2);
        for (let i = 0; i < trimmed.length; i += 2) {
            bytes[i / 2] = parseInt(trimmed.slice(i, i + 2), 16);
        }
        return bytes;
    }

    // 3) Try base58 string
    if (isBase58(trimmed)) {
        // inline base58 decoder (no external deps)
        const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
        const BASE = 58;
        const indices: Record<string, number> = {};
        for (let i = 0; i < ALPHABET.length; i++) indices[ALPHABET[i]] = i;

        const bytes: number[] = [0];
        for (const char of trimmed) {
            const value = indices[char];
            if (value === undefined) throw new Error("Invalid base58 character encountered");
            let carry = value;
            for (let j = 0; j < bytes.length; j++) {
                const x = bytes[j] * BASE + carry;
                bytes[j] = x & 0xff;
                carry = x >> 8;
            }
            while (carry > 0) {
                bytes.push(carry & 0xff);
                carry >>= 8;
            }
        }
        // Deal with leading zeros
        let leadingZeroCount = 0;
        for (const c of trimmed) {
            if (c === "1") leadingZeroCount++;
            else break;
        }
        const result = new Uint8Array(leadingZeroCount + bytes.length);
        for (let i = 0; i < bytes.length; i++) {
            result[result.length - 1 - i] = bytes[i];
        }
        return result;
    }

    throw new Error("Unrecognized private key format. Provide base58, hex, or byte array.");
}

function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error("Usage: ts-node generate-keypair.ts <PRIVATE_KEY> [outputPath] [fileName]");
        console.error("- PRIVATE_KEY can be base58, hex, or JSON/CSV byte array");
        process.exit(1);
    }

    const input = args[0];
    const outputDir = args[1] || path.resolve(__dirname, "keypairs");
    const fileName = args[2] || "admin-keypair.json";

    const secretKey = parsePrivateKey(input);
    // Accept either 32-byte seed or full 64-byte secretKey; pad via Keypair.fromSecretKey expects 64 bytes
    let keypair: Keypair;
    if (secretKey.length === 64) {
        keypair = Keypair.fromSecretKey(secretKey);
    } else if (secretKey.length === 32) {
        // If only 32-byte seed is provided, create from seed by deriving ed25519 keypair
        // Use nacl.sign.keyPair.fromSeed to expand; avoid extra deps by leveraging webcrypto if available
        // Node 18+ has crypto.subtle, but simplest is to error out to avoid ambiguity
        throw new Error("32-byte seed provided. Please supply the full 64-byte secret key array.");
    } else {
        throw new Error("Secret key must be 64 bytes when decoded.");
    }

    const outPath = path.resolve(outputDir, fileName);
    mkdirSync(outputDir, { recursive: true });

    const bytes = Array.from(keypair.secretKey);
    writeFileSync(outPath, JSON.stringify(bytes));

    console.log("Wrote keypair to:", outPath);
}

main();


