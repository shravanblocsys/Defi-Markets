# DeFi Markets Admin Panel

A comprehensive administrative dashboard for managing DeFi Markets' ETF vault platform, built with modern web technologies and a focus on security and user experience.

## 🎯 Overview

The DeFi Markets Admin Panel provides administrators and operators with powerful tools to:
- Monitor and manage ETF vault operations
- Track platform performance and analytics
- Manage user wallets and permissions
- Configure fees and platform parameters
- Audit system activities and user actions
- Oversee platform health and security

## 🚀 Features

### Core Administration
- **Dashboard Overview**: Real-time platform metrics and health monitoring
- **Vault Management**: Create, pause, and manage ETF vaults
- **Wallet Administration**: Manage treasury wallets and user permissions
- **Fee Configuration**: Set and update platform fees and parameters
- **Audit Logging**: Comprehensive tracking of all administrative actions
- **User Management**: Monitor and manage platform users and operators

### Security & Monitoring
- **Real-time Health Checks**: API status and performance monitoring
- **Activity Tracking**: Detailed audit logs for compliance and security
- **Access Control**: Role-based permissions and authentication
- **Security Monitoring**: Suspicious activity detection and alerts

## 🛠️ Tech Stack

- **Frontend**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: Redux Toolkit + React Redux
- **Data Fetching**: TanStack Query (React Query)
- **Routing**: React Router DOM
- **UI Components**: Radix UI primitives
- **Charts**: Recharts for data visualization
- **Forms**: React Hook Form with Zod validation
- **Authentication**: Reown AppKit for Web3 wallet integration
- **Blockchain**: Solana integration via AppKit adapter

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd defi-markets-admin
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   bun install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   # or
   bun dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:5173` to access the admin panel.

## 🏗️ Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── admin/          # Admin-specific components
│   │   └── AdminLayout.tsx
│   ├── layout/         # Layout components (Navigation, Footer)
│   ├── ui/             # shadcn/ui components
│   └── wallet/         # Wallet connection components
├── pages/              # Application pages
│   └── admin/          # Admin panel pages
│       ├── Dashboard.tsx      # Main dashboard
│       ├── AdminVaults.tsx   # Vault management
│       ├── Wallets.tsx       # Wallet administration
│       ├── Fees.tsx          # Fee configuration
│       ├── AuditLogs.tsx     # Audit logging
│       └── Login.tsx         # Authentication
├── hooks/              # Custom React hooks
├── lib/                # Utility functions and configurations
├── services/           # API and external service integrations
├── store/              # Redux store and slices
│   └── slices/         # Redux toolkit slices
├── types/              # TypeScript type definitions
└── assets/             # Static assets (images, icons)
```

## 🚀 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run build:dev` - Build for development
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## 🎯 Admin Panel Pages

### Dashboard
- Platform overview with key metrics
- Real-time vault statistics
- System health monitoring
- Recent activity feed

### Vault Management
- Create and deploy new ETF vaults
- Pause/resume vault operations
- Monitor vault performance
- Manage vault configurations

### Wallet Administration
- Treasury wallet management
- User wallet permissions
- Security settings
- Transaction monitoring

### Fee Configuration
- Management fee settings
- Performance fee parameters
- Platform fee structure
- Fee update history

### Audit Logs
- Comprehensive activity tracking
- User action history
- System event logging
- Compliance reporting

## 🔧 Configuration

The project uses several configuration files:
- `vite.config.ts` - Vite build configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `tsconfig.json` - TypeScript configuration
- `eslint.config.js` - ESLint rules
- `components.json` - shadcn/ui component configuration

## 🔐 Authentication & Security

- **Web3 Wallet Integration**: Connect via Solana wallets
- **Role-based Access Control**: Different permission levels for admins and operators
- **Secure API Communication**: Protected endpoints for sensitive operations
- **Audit Trail**: Complete logging of all administrative actions

## 📱 Responsive Design

The admin panel is fully responsive and optimized for:
- Desktop (1024px+) - Full feature access
- Tablet (768px - 1023px) - Optimized layout
- Mobile (320px - 767px) - Essential functions

## 🎨 Design System

Built with a comprehensive design system featuring:
- Dark theme optimized for admin workflows
- Consistent color palette and typography
- Accessible UI components following WCAG guidelines
- Smooth animations and transitions
- Professional admin interface aesthetics

## 🔗 Dependencies

### Core Dependencies
- React 18 with TypeScript for type safety
- Redux Toolkit for state management
- TanStack Query for server state management
- React Router for navigation
- Radix UI for accessible components

### Blockchain Integration
- Reown AppKit for Web3 functionality
- Solana adapter for blockchain operations
- BS58 for Solana address encoding

### UI & Styling
- Tailwind CSS for utility-first styling
- shadcn/ui for pre-built components
- Lucide React for consistent iconography
- Recharts for data visualization

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔗 Links

- [Live Demo](https://your-demo-url.com)
- [Documentation](https://your-docs-url.com)
- [Issues](https://github.com/your-username/defi-markets-admin/issues)

## ⚠️ Important Notes

- This is an **administrative panel** for DeFi Markets platform operators
- Requires proper authentication and authorization to access
- Designed for internal use by platform administrators
- Includes sensitive financial and operational data
