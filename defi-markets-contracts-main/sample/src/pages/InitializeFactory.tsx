import { useCallback, useMemo, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import { SystemProgram, PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import idl from "../assets/vault_mvp.json";
import type { VaultMvp } from "../assets/vault_mvp";
import "./InitializeFactory.css";

// Seed used by the on-chain program for the factory PDA
const FACTORY_SEED = "factory_v2";

// RPC already provided by WalletSetup

type TabType = "factory" | "factoryInfo";

export default function InitializeFactory() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [activeTab, setActiveTab] = useState<TabType>("factoryInfo");
  const [loading, setLoading] = useState(false);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adminTxSig, setAdminTxSig] = useState<string | null>(null);
  const [newAdminInput, setNewAdminInput] = useState<string>("");
  const [factoryInfo, setFactoryInfo] = useState<{
    factoryAddress: string;
    admin: string;
    feeRecipient: string;
    vaultCount: number;
    state: unknown;
    entryFeeBps: number;
    exitFeeBps: number;
    vaultCreationFeeUsdc: string;
    minManagementFeeBps: number;
    maxManagementFeeBps: number;
    vaultCreatorFeeRatioBps: number;
    platformFeeRatioBps: number;
  } | null>(null);

  // Prefer the program ID baked in your IDL; can be overridden if needed
  const programId = useMemo(() => {
    const idlWithAddress = idl as { address?: string };
    if (idlWithAddress.address) {
      return new PublicKey(idlWithAddress.address);
    }
    throw new Error("Program ID not found in IDL");
  }, []);

  const program = useMemo(() => {
    if (
      !wallet.publicKey ||
      !wallet.signTransaction ||
      !wallet.signAllTransactions
    )
      return null;

    const provider = new anchor.AnchorProvider(
      connection,
      wallet as unknown as anchor.Wallet,
      { preflightCommitment: "processed" }
    );

    return new anchor.Program<VaultMvp>(idl as anchor.Idl, provider);
  }, [connection, wallet]);

  const initialize = useCallback(async () => {
    if (!wallet.connected || !wallet.publicKey) {
      setError("Connect Phantom to continue");
      return;
    }
    if (!program) {
      setError("Program not ready. Ensure wallet is connected.");
      return;
    }

    setLoading(true);
    setError(null);
    setTxSig(null);

    try {
      const [factoryPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(FACTORY_SEED)],
        program.programId
      );

      // Mirror defaults from your ledger script
      const entryFeeBps = 25;
      const exitFeeBps = 25;
      const vaultCreationFeeUsdc = new anchor.BN(10_000_000); // 10 USDC (6 decimals)
      const minManagementFeeBps = 50;
      const maxManagementFeeBps = 300;
      const vaultCreatorFeeRatioBps = 7000;
      const platformFeeRatioBps = 3000;

      const tx = await program.methods
        .initializeFactory(
          entryFeeBps,
          exitFeeBps,
          vaultCreationFeeUsdc,
          minManagementFeeBps,
          maxManagementFeeBps,
          vaultCreatorFeeRatioBps,
          platformFeeRatioBps
        )
        .accountsStrict({
          admin: wallet.publicKey,
          factory: factoryPDA,
          feeRecipient: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setTxSig(tx);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Initialization failed");
    } finally {
      setLoading(false);
    }
  }, [program, wallet]);

  const fetchFactoryInfo = useCallback(async () => {
    if (!wallet.connected) {
      setError("Connect Phantom to continue");
      return;
    }
    if (!program) {
      setError("Program not ready. Ensure wallet is connected.");
      return;
    }

    setError(null);
    setFactoryInfo(null);

    try {
      const [factoryPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(FACTORY_SEED)],
        program.programId
      );

      const info = await program.methods
        .getFactoryInfo()
        .accountsStrict({
          factory: factoryPDA,
        })
        .view();

      setFactoryInfo({
        factoryAddress:
          info.factoryAddress?.toBase58?.() ?? String(info.factoryAddress),
        admin: info.admin?.toBase58?.() ?? String(info.admin),
        feeRecipient:
          info.feeRecipient?.toBase58?.() ?? String(info.feeRecipient),
        vaultCount: info.vaultCount,
        state: info.state,
        entryFeeBps: info.entryFeeBps,
        exitFeeBps: info.exitFeeBps,
        vaultCreationFeeUsdc:
          info.vaultCreationFeeUsdc?.toString?.() ??
          String(info.vaultCreationFeeUsdc),
        minManagementFeeBps: info.minManagementFeeBps,
        maxManagementFeeBps: info.maxManagementFeeBps,
        vaultCreatorFeeRatioBps: info.vaultCreatorFeeRatioBps,
        platformFeeRatioBps: info.platformFeeRatioBps,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch factory info");
    }
  }, [program, wallet]);

  const updateFactoryAdmin = useCallback(async () => {
    if (!wallet.connected || !wallet.publicKey) {
      setError("Connect Phantom to continue");
      return;
    }
    if (!program) {
      setError("Program not ready. Ensure wallet is connected.");
      return;
    }
    if (!newAdminInput) {
      setError("Enter a new admin public key");
      return;
    }

    setError(null);
    setAdminTxSig(null);

    try {
      const newAdminPk = new PublicKey(newAdminInput);
      const [factoryPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(FACTORY_SEED)],
        program.programId
      );

      const tx = await program.methods
        .updateFactoryAdmin()
        .accountsStrict({
          admin: wallet.publicKey,
          factory: factoryPDA,
          newAdmin: newAdminPk,
        })
        .rpc();

      setAdminTxSig(tx);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update factory admin");
    }
  }, [newAdminInput, program, wallet]);

  return (
    <div className="factory-container">
      <div className="factory-header">
        <div className="header-content">
          <p className="header-description">
            Connect Phantom and initialize the on-chain factory
          </p>
          <div className="header-actions">
            {programId && (
              <span className="program-id">
                Program: {programId.toBase58()}
              </span>
            )}
            <WalletMultiButton />
          </div>
        </div>

        <div className="tabs">
          <button
            className={`tab ${activeTab === "factory" ? "active" : ""}`}
            onClick={() => setActiveTab("factory")}
          >
            Factory
          </button>
          <button
            className={`tab ${activeTab === "factoryInfo" ? "active" : ""}`}
            onClick={() => setActiveTab("factoryInfo")}
          >
            Factory Info
          </button>
        </div>
      </div>

      <div className="factory-content">
        {activeTab === "factory" && (
          <div className="tab-panel">
            <h2>Initialize Factory</h2>
            <p>Initialize the on-chain factory PDA using your IDL.</p>

            <div className="action-section">
              <button
                className="primary-button"
                disabled={!wallet.connected || loading}
                onClick={initialize}
              >
                {loading ? "Initializing…" : "Initialize Factory"}
              </button>
            </div>

              <div className="divider" />

              <h3>Update Factory Admin</h3>
              <p>Provide the new admin public key and submit the update.</p>
              <div className="action-row">
                <input
                  className="text-input"
                  placeholder="New admin public key"
                  value={newAdminInput}
                  onChange={(e) => setNewAdminInput(e.target.value)}
                />
                <button
                  className="secondary-button"
                  disabled={!wallet.connected || !newAdminInput}
                  onClick={updateFactoryAdmin}
                >
                  Update Admin
                </button>
              </div>

            {txSig && (
              <div className="transaction-info">
                <strong>Transaction:</strong>{" "}
                <a
                  href={`https://explorer.solana.com/tx/${txSig}?cluster=mainnet-beta`}
                  target="_blank"
                  rel="noreferrer"
                  className="transaction-link"
                >
                  {txSig}
                </a>
              </div>
            )}

              {adminTxSig && (
                <div className="transaction-info">
                  <strong>Admin Update Tx:</strong>{" "}
                  <a
                    href={`https://explorer.solana.com/tx/${adminTxSig}?cluster=mainnet-beta`}
                    target="_blank"
                    rel="noreferrer"
                    className="transaction-link"
                  >
                    {adminTxSig}
                  </a>
                </div>
              )}

            {error && <div className="error-message">{error}</div>}
          </div>
        )}

        {activeTab === "factoryInfo" && (
          <div className="tab-panel">
            <div className="action-section">
              <button
                className="primary-button"
                disabled={!wallet.connected}
                onClick={fetchFactoryInfo}
              >
                Fetch Factory Info
              </button>
            </div>

            {error && <div className="error-message">{error}</div>}

            {factoryInfo && (
              <div className="factory-info-display">
                <div className="info-item">
                  <span className="info-label">factoryAddress:</span>
                  <span className="info-value">
                    {factoryInfo.factoryAddress}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">admin:</span>
                  <span className="info-value">{factoryInfo.admin}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">feeRecipient:</span>
                  <span className="info-value">{factoryInfo.feeRecipient}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">vaultCount:</span>
                  <span className="info-value">{factoryInfo.vaultCount}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">state:</span>
                  <span className="info-value">
                    {JSON.stringify(factoryInfo.state)}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">entryFeeBps:</span>
                  <span className="info-value">{factoryInfo.entryFeeBps}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">exitFeeBps:</span>
                  <span className="info-value">{factoryInfo.exitFeeBps}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">vaultCreationFeeUsdc:</span>
                  <span className="info-value">
                    "{factoryInfo.vaultCreationFeeUsdc}"
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">minManagementFeeBps:</span>
                  <span className="info-value">
                    {factoryInfo.minManagementFeeBps}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">maxManagementFeeBps:</span>
                  <span className="info-value">
                    {factoryInfo.maxManagementFeeBps}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">vaultCreatorFeeRatioBps:</span>
                  <span className="info-value">
                    {factoryInfo.vaultCreatorFeeRatioBps}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">platformFeeRatioBps:</span>
                  <span className="info-value">
                    {factoryInfo.platformFeeRatioBps}
                  </span>
                </div>
              </div>
            )}

            {!factoryInfo && !error && (
              <div className="empty-state">
                Click "Fetch Factory Info" to load factory information
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
