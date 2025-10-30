# DeFi Markets - Permissionless ETF Vault Platform
A modern, decentralized platform for creating and managing permissionless ETF vaults with institutional-grade infrastructure.

## 🚀 Features

- **Permissionless Vault Creation**: Create and deploy custom ETF vaults without restrictions
- **Smart Asset Allocation**: Automated asset allocation and rebalancing for optimal performance
- **Instant Liquidity**: Seamlessly swap between assets using integrated DEX aggregators
- **Portfolio Management**: Track and manage your diversified DeFi portfolios
- **Real-time Analytics**: Monitor vault performance with comprehensive dashboards

## 🛠️ Tech Stack

- **Frontend**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: TanStack Query (React Query)
- **Routing**: React Router DOM
- **UI Components**: Radix UI primitives
- **Charts**: Recharts for data visualization
- **Forms**: React Hook Form with Zod validation

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd defi-markets-FE
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
   Navigate to `http://localhost:5173` to view the application.

## 🏗️ Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── layout/         # Layout components (Navigation, Footer)
│   └── ui/            # shadcn/ui components
├── pages/             # Application pages
│   ├── Home.tsx       # Landing page
│   ├── CreateVault.tsx # Vault creation interface
│   ├── Vaults.tsx     # Vault listing and management
│   ├── Portfolio.tsx  # Portfolio dashboard
│   └── About.tsx      # About page
├── hooks/             # Custom React hooks
├── lib/               # Utility functions and configurations
└── assets/            # Static assets (images, icons)
```

## 🚀 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run build:dev` - Build for development
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## 🎯 Key Pages

- **Home**: Landing page with platform overview and featured vaults
- **Create Vault**: Interface for creating new ETF vaults with asset allocation
- **Vaults**: Browse and interact with existing vaults
- **Portfolio**: Personal portfolio dashboard with performance metrics
- **About**: Platform information and documentation

## 🔧 Configuration

The project uses several configuration files:
- `vite.config.ts` - Vite build configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `tsconfig.json` - TypeScript configuration
- `eslint.config.js` - ESLint rules

## 📱 Responsive Design

The application is fully responsive and optimized for:
- Desktop (1024px+)
- Tablet (768px - 1023px)
- Mobile (320px - 767px)

## 🎨 Design System

Built with a comprehensive design system featuring:
- Dark theme by default
- Consistent color palette and typography
- Accessible UI components
- Smooth animations and transitions

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
- [Issues](https://github.com/your-username/defi-markets-FE/issues)
