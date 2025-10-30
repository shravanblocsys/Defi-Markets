# Vault MVP - Modular Structure

This document describes the modular structure of the Vault MVP program, which has been refactored from a single-file program into a well-organized, modular architecture.

## File Structure

```
programs/vault-mvp/src/
├── lib.rs              # Main program entry point and module declarations
├── constants.rs        # Program constants and configuration values
├── state.rs           # Account structures and data models
├── contexts.rs        # Context structures for instructions (renamed from accounts.rs)
├── instructions.rs    # Instruction implementations
├── events.rs          # Event definitions
└── errors.rs          # Error codes and custom error types
```

## Module Descriptions

### 1. `lib.rs` - Main Program Entry Point
- **Purpose**: Main program module that declares all sub-modules and provides the program interface
- **Contents**:
  - Module declarations for all sub-modules
  - Re-exports of commonly used items
  - `#[program]` module with instruction handlers that delegate to the instructions module
- **Key Features**:
  - Clean separation between program interface and implementation
  - Delegates all instruction logic to the `instructions` module
  - Provides a single entry point for the program

### 2. `constants.rs` - Configuration Constants
- **Purpose**: Centralized location for all program constants and configuration values
- **Contents**:
  - Fee-related constants (MAX_BPS, DEFAULT_ENTRY_EXIT_FEE_BPS, etc.)
  - Validation limits (MAX_ENTRY_EXIT_BPS_LIMIT, MAX_MANAGEMENT_BPS_LIMIT, etc.)
  - Asset limits (MAX_UNDERLYING_ASSETS, MAX_VAULT_NAME_LENGTH, etc.)
- **Benefits**:
  - Easy to modify configuration values
  - Prevents magic numbers throughout the codebase
  - Single source of truth for all constants

### 3. `state.rs` - Account Structures and Data Models
- **Purpose**: Defines all account structures, data models, and their implementations
- **Contents**:
  - `Factory` account structure with initialization space calculation
  - `Vault` account structure with initialization space calculation
  - `UnderlyingAsset` struct for vault asset configuration
  - Info structs (`VaultInfo`, `FactoryInfo`, `DepositDetails`)
  - State enums (`VaultState`, `FactoryState`)
- **Benefits**:
  - Clear separation of data models from business logic
  - Easy to understand account structures
  - Centralized space calculations

### 4. `contexts.rs` - Context Structures (formerly accounts.rs)
- **Purpose**: Defines all instruction context structures for account validation
- **Contents**:
  - `InitializeFactory` context
  - `CreateVault` context
  - `GetVaultByIndex` context
  - `UpdateFactoryFees` context
  - `GetFactoryInfo` context
  - `Deposit` context
  - `GetDepositDetails` context
  - `Redeem` context
- **Benefits**:
  - Clear account validation rules
  - Separation of concerns between account validation and business logic
  - Easy to maintain and extend

### 5. `instructions.rs` - Instruction Implementations
- **Purpose**: Contains all the business logic for each instruction
- **Contents**:
  - `initialize_factory()` - Factory initialization logic
  - `create_vault()` - Vault creation logic
  - `get_vault_by_index()` - Vault information retrieval
  - `update_factory_fees()` - Factory fee update logic
  - `get_factory_info()` - Factory information retrieval
  - `deposit()` - Deposit logic with fee calculations
  - `get_deposit_details()` - Deposit information retrieval
  - `redeem()` - Redeem logic with fee calculations
- **Benefits**:
  - Pure business logic separated from account validation
  - Easy to test individual instruction logic
  - Clear separation of concerns

### 6. `events.rs` - Event Definitions
- **Purpose**: Defines all program events for logging and monitoring
- **Contents**:
  - `FactoryInitialized` event
  - `VaultCreated` event
  - `FactoryFeesUpdated` event
  - `DepositEvent` event
  - `RedeemEvent` event
- **Benefits**:
  - Centralized event definitions
  - Easy to add new events
  - Clear event structure for frontend integration

### 7. `errors.rs` - Error Codes
- **Purpose**: Defines all custom error codes for the program
- **Contents**:
  - Fee-related errors (`FeesTooHigh`, `InvalidFeeRange`)
  - Validation errors (`VaultNameTooLong`, `VaultSymbolTooLong`)
  - State errors (`VaultNotActive`, `FactoryNotActive`)
  - Authorization errors (`Unauthorized`)
  - Balance errors (`InsufficientVaultTokens`, `InsufficientVaultBalance`)
- **Benefits**:
  - Centralized error management
  - Clear error messages for debugging
  - Easy to add new error types

## Benefits of Modular Structure

### 1. **Maintainability**
- Each module has a single responsibility
- Easy to locate and modify specific functionality
- Clear separation of concerns

### 2. **Readability**
- Code is organized logically by functionality
- Easy to understand the program structure
- Clear module boundaries

### 3. **Testability**
- Individual modules can be tested in isolation
- Business logic is separated from account validation
- Easy to mock dependencies

### 4. **Scalability**
- Easy to add new features by creating new modules
- Existing modules can be extended without affecting others
- Clear patterns for adding new instructions

### 5. **Code Reusability**
- Constants and utilities can be easily shared
- Common patterns are centralized
- Easy to extract common functionality

## Migration Notes

### Key Changes Made:
1. **Renamed `accounts.rs` to `contexts.rs`** - Avoided naming conflict with Anchor's internal `accounts` namespace
2. **Separated instruction logic** - Moved all business logic from the program module to the instructions module
3. **Centralized constants** - Moved all constants to a dedicated module
4. **Organized by functionality** - Each module has a clear, single purpose

### Compilation Status:
✅ **Successfully compiles** with only minor warnings related to Anchor framework configuration
✅ **All functionality preserved** - No changes to program behavior
✅ **Clean module structure** - Easy to navigate and maintain

## Usage

The modular structure maintains the same external interface as the original single-file program. All instructions work exactly the same way, but the code is now much more organized and maintainable.

### Example Usage:
```rust
// The program interface remains the same
use vault_mvp::*;

// All the same instructions are available
program.initialize_factory(...)
program.create_vault(...)
program.deposit(...)
program.redeem(...)
```

This modular structure provides a solid foundation for future development and makes the codebase much more maintainable and scalable.
