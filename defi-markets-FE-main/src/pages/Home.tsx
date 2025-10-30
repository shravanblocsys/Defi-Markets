import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import StatsCard from "@/components/ui/stats-card";
import VaultCard from "@/components/ui/vault-card";
import {
  TrendingUp,
  Shield,
  Zap,
  Users,
  DollarSign,
  Target,
  ArrowRight,
  CheckCircle,
} from "lucide-react";
import heroImage from "@/assets/hero-bg.jpg";

const Home = () => {
  const [stats, setStats] = useState({
    totalTVL: "$142.8M",
    totalVaults: "1,247",
    users: "23,891",
    apy: "14.2%",
  });

  const featuredVaults = [
    {
      name: "Blue Chip Basket",
      symbol: "BCB-ETF",
      apy: "12.4%",
      tvl: "$24.3M",
      capacity: 78,
      assets: ["BTC", "ETH", "SOL"],
      risk: "Low" as const,
      nav: "$1.24",
      tokenSupply: "19.6M",
      creator: {
        name: "DeFi Capital",
        twitter: "https://twitter.com/defi_capital",
      },
      banner: "/api/placeholder/400/150",
      logo: "/api/placeholder/40/40",
    },
    {
      name: "DeFi Alpha Fund",
      symbol: "DAF-ETF",
      apy: "18.7%",
      tvl: "$12.1M",
      capacity: 45,
      assets: ["UNI", "AAVE", "COMP", "CRV"],
      risk: "Medium" as const,
      nav: "$0.87",
      tokenSupply: "13.9M",
      creator: {
        name: "Alpha Strategies",
        twitter: "https://twitter.com/alpha_strategies",
      },
      banner: "/api/placeholder/400/150",
      logo: "/api/placeholder/40/40",
    },
    {
      name: "Yield Maximizer",
      symbol: "YMX-ETF",
      apy: "24.3%",
      tvl: "$8.9M",
      capacity: 62,
      assets: ["stETH", "rETH", "LIDO"],
      risk: "Medium" as const,
      nav: "$1.56",
      tokenSupply: "5.7M",
      creator: {
        name: "Yield Labs",
        twitter: "https://twitter.com/yield_labs",
      },
      banner: "/api/placeholder/400/150",
      logo: "/api/placeholder/40/40",
    },
  ];

  const features = [
    {
      icon: <Shield className="h-6 w-6" />,
      title: "Permissionless Vaults",
      description:
        "Create and deploy custom ETF vaults without restrictions or approvals.",
    },
    {
      icon: <Zap className="h-6 w-6" />,
      title: "Instant Liquidity",
      description:
        "Seamlessly swap between assets using integrated DEX aggregators.",
    },
    {
      icon: <Target className="h-6 w-6" />,
      title: "Smart Allocation",
      description:
        "Automated asset allocation and rebalancing for optimal performance.",
    },
  ];

  const workflowSteps = [
    {
      step: "1",
      title: "Create Vault",
      description: "Configure asset allocation and parameters",
    },
    {
      step: "2",
      title: "Deposit Assets",
      description: "Fund your vault with USDT or platform tokens",
    },
    {
      step: "3",
      title: "Auto-Allocation",
      description: "Assets automatically swap to configured tokens",
    },
    {
      step: "4",
      title: "Receive ETF Tokens",
      description: "Get proportional ownership tokens in your wallet",
    },
    {
      step: "5",
      title: "Monitor & Redeem",
      description: "Track performance and redeem anytime",
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-70"
          style={{ backgroundImage: `url(${heroImage})` }}
        />
        {/* <div className="absolute inset-0 bg-gradient-hero opacity-90" /> */}

        <div className="relative container mx-auto px-4 lg:px-8 pt-24 pb-32">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="space-y-4 animate-fade-in">
              <h1 className="text-5xl md:text-7xl font-bold text-glow">
                The Future of
                <span className="bg-gradient-primary bg-clip-text text-transparent">
                  {" "}
                  DeFi Investing
                </span>
              </h1>
              <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
                Create permissionless ETF vaults, manage diversified portfolios,
                and trade with institutional-grade infrastructure
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center animate-scale-in">
              <Button variant="hero" size="lg" asChild>
                <Link to="/create-vault">
                  <Target className="w-5 h-5 mr-2" />
                  Create Vault
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Link>
              </Button>
              <Button variant="glass" size="lg" asChild>
                <Link to="/vaults">
                  <TrendingUp className="w-5 h-5 mr-2" />
                  Browse Vaults
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 mt-16 relative ">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatsCard
              title="Total Value Locked"
              value={stats.totalTVL}
              change="+12.3% this month"
              trend="up"
              icon={<DollarSign className="h-6 w-6 text-success" />}
            />
            <StatsCard
              title="Active Vaults"
              value={stats.totalVaults}
              change="+47 this week"
              trend="up"
              icon={<Target className="h-6 w-6 text-primary" />}
            />
            <StatsCard
              title="Users"
              value={stats.users}
              change="+8.1% this month"
              trend="up"
              icon={<Users className="h-6 w-6 text-accent" />}
            />
            <StatsCard
              title="Avg APY"
              value={stats.apy}
              change="+2.4% this quarter"
              trend="up"
              icon={<TrendingUp className="h-6 w-6 text-success" />}
            />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl font-bold">Why Choose DeFiMarkets?</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Advanced DeFi infrastructure designed for the next generation of
              investors
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="glass-card p-8 text-center space-y-4 hover-glow transition-all duration-normal"
              >
                <div className="p-4 rounded-lg bg-gradient-primary w-fit mx-auto">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Vaults */}
      <section className="py-20 bg-surface-1">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex justify-between items-center mb-12">
            <div>
              <h2 className="text-3xl font-bold mb-2">Featured Vaults</h2>
              <p className="text-muted-foreground">
                Top performing vaults this month
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link to="/vaults">
                View All Vaults
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {featuredVaults.map((vault, index) => (
              <VaultCard key={index} {...vault} />
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl font-bold">How It Works</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Simple steps to start building your DeFi portfolio
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
            {workflowSteps.map((step, index) => (
              <div key={index} className="text-center space-y-4">
                <div className="relative">
                  <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-lg mx-auto">
                    {step.step}
                  </div>
                  {index < workflowSteps.length - 1 && (
                    <div className="hidden md:block absolute top-6 left-full w-full h-0.5 bg-border-subtle" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-surface">
        <div className="container mx-auto px-4 lg:px-8 text-center">
          <div className="max-w-3xl mx-auto space-y-8">
            <h2 className="text-4xl font-bold">Ready to Start Building?</h2>
            <p className="text-xl text-muted-foreground">
              Join thousands of users creating the future of decentralized
              finance
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="hero" size="lg" asChild>
                <Link to="/create-vault">
                  Create Your First Vault
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Link>
              </Button>
              <Button variant="glass" size="lg" asChild>
                <Link to="/about">Learn More</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Risk Disclaimer */}
      <section className="py-12 ">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex justify-center items-center">
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center space-x-2 text-muted-foreground">
                <Shield className="h-4 w-4" />
                <span className="text-sm font-medium">Risk Disclosure</span>
              </div>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Returns are variable and not guaranteed. Your assets may lose
                value. Past performance does not indicate future results. Please
                invest responsibly.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
