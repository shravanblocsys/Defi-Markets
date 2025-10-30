import { Connection, clusterApiUrl } from "@solana/web3.js";

async function estimateCost() {
    const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

    // Current optimized program size (after removing unused functions)
    const space = 604016; // bytes
    const lamports = await connection.getMinimumBalanceForRentExemption(space);

    console.log("=== Vault MVP Deployment Cost Estimation ===");
    console.log(`Program size: ${space} bytes (${(space / 1024).toFixed(1)} KB)`);
    console.log(`Rent exemption: ${lamports} lamports`);
    console.log(`Cost in SOL: ${(lamports / 1e9).toFixed(6)} SOL`);
    console.log(`Cost in USD (at $224/SOL): $${((lamports / 1e9) * 224).toFixed(2)}`);
    console.log("\n=== Cost Breakdown ===");
    console.log(`Per byte: ${(lamports / space / 1e9).toFixed(10)} SOL`);
    console.log(`Per KB: ${(lamports / (space / 1024) / 1e9).toFixed(6)} SOL`);
    console.log("\n=== Recommendations ===");
    console.log(`Minimum wallet balance: ${((lamports / 1e9) + 0.5).toFixed(2)} SOL`);
    console.log(`Recommended buffer: 0.5 SOL`);
}

async function estimateUpgradeCost() {
    const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

    // Current optimized program size
    const currentSpace = 518880; // bytes
    const currentLamports = await connection.getMinimumBalanceForRentExemption(currentSpace);

    console.log("\n=== Program Upgrade Cost Estimation ===");
    console.log("Current program size:", `${currentSpace} bytes (${(currentSpace / 1024).toFixed(1)} KB)`);
    console.log("Current rent exemption:", `${currentLamports} lamports (${(currentLamports / 1e9).toFixed(6)} SOL)`);
    
    console.log("\n=== Upgrade Scenarios ===");
    
    // Scenario 1: Same size upgrade
    console.log("1. Same Size Upgrade (no size change):");
    console.log("   - Upgrade cost: ~0.000005 SOL (transaction fee only)");
    console.log("   - No additional rent exemption needed");
    
    // Scenario 2: Larger program
    const largerSpace = Math.floor(currentSpace * 1.2); // 20% larger
    const largerLamports = await connection.getMinimumBalanceForRentExemption(largerSpace);
    const additionalLamports = largerLamports - currentLamports;
    
    console.log(`\n2. Larger Program (${largerSpace} bytes, ${(largerSpace / 1024).toFixed(1)} KB):`);
    console.log(`   - Additional rent exemption: ${additionalLamports} lamports`);
    console.log(`   - Additional cost: ${(additionalLamports / 1e9).toFixed(6)} SOL`);
    console.log(`   - Total upgrade cost: ${((additionalLamports / 1e9) + 0.000005).toFixed(6)} SOL`);
    console.log(`   - Cost in USD: $${(((additionalLamports / 1e9) + 0.000005) * 224).toFixed(2)}`);
    
    // Scenario 3: Smaller program
    const smallerSpace = Math.floor(currentSpace * 0.8); // 20% smaller
    const smallerLamports = await connection.getMinimumBalanceForRentExemption(smallerSpace);
    
    console.log(`\n3. Smaller Program (${smallerSpace} bytes, ${(smallerSpace / 1024).toFixed(1)} KB):`);
    console.log(`   - Upgrade cost: ~0.000005 SOL (transaction fee only)`);
    console.log(`   - No additional rent exemption needed`);
    console.log(`   - Note: You don't get refunded for the smaller size`);
    
    // Scenario 4: Significant size increase
    const muchLargerSpace = Math.floor(currentSpace * 1.5); // 50% larger
    const muchLargerLamports = await connection.getMinimumBalanceForRentExemption(muchLargerSpace);
    const muchAdditionalLamports = muchLargerLamports - currentLamports;
    
    console.log(`\n4. Significant Size Increase (${muchLargerSpace} bytes, ${(muchLargerSpace / 1024).toFixed(1)} KB):`);
    console.log(`   - Additional rent exemption: ${muchAdditionalLamports} lamports`);
    console.log(`   - Additional cost: ${(muchAdditionalLamports / 1e9).toFixed(6)} SOL`);
    console.log(`   - Total upgrade cost: ${((muchAdditionalLamports / 1e9) + 0.000005).toFixed(6)} SOL`);
    console.log(`   - Cost in USD: $${(((muchAdditionalLamports / 1e9) + 0.000005) * 224).toFixed(2)}`);
    
    console.log("\n=== Upgrade Cost Summary ===");
    console.log("• Same/Smaller size: ~0.000005 SOL (transaction fee only)");
    console.log("• Larger size: Additional rent exemption + transaction fee");
    console.log("• Upgrade authority: Must be set during initial deployment");
    console.log("• Network fees: ~0.000005 SOL per transaction");
    
    console.log("\n=== Upgrade Recommendations ===");
    console.log("• Keep upgrade authority secure and accessible");
    console.log("• Test upgrades on devnet first");
    console.log("• Monitor program size changes during development");
    console.log("• Consider breaking changes vs. additive changes");
}

async function main() {
    await estimateCost();
    await estimateUpgradeCost();
}

main().catch(console.error);