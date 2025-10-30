import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Shield, 
  Zap, 
  Target, 
  Users, 
  Lock, 
  Globe,
  ArrowRight,
  CheckCircle,
  TrendingUp
} from "lucide-react";
import { Link } from "react-router-dom";

const About = () => {
  const features = [
    {
      icon: <Shield className="h-8 w-8" />,
      title: "Permissionless Creation",
      description: "Create and deploy custom ETF vaults without restrictions or approvals. Full control over your investment strategy."
    },
    {
      icon: <Zap className="h-8 w-8" />,
      title: "Instant Liquidity",
      description: "Seamlessly swap between assets using integrated DEX aggregators with optimal pricing and minimal slippage."
    },
    {
      icon: <Target className="h-8 w-8" />,
      title: "Smart Allocation",
      description: "Automated asset allocation and rebalancing based on your predefined strategy for optimal performance."
    },
    {
      icon: <Lock className="h-8 w-8" />,
      title: "Non-Custodial",
      description: "Your assets remain in your control at all times. We never have access to your funds or private keys."
    },
    {
      icon: <Globe className="h-8 w-8" />,
      title: "Global Access",
      description: "Access from anywhere in the world with just a Web3 wallet. No KYC or geographical restrictions."
    },
    {
      icon: <Users className="h-8 w-8" />,
      title: "Community Driven",
      description: "Built by the community, for the community. Open governance and transparent development process."
    }
  ];

  const workflowSteps = [
    {
      step: "01",
      title: "Vault Creation",
      description: "Configure vault parameters including asset allocation, capacity limits, token name, and management fees. Deploy your unique ETF token contract.",
      details: ["Set asset allocation percentages", "Define capacity and fee structure", "Deploy smart contract", "Mint ETF tokens"]
    },
    {
      step: "02", 
      title: "User Deposits",
      description: "Users deposit USDT or platform tokens into your vault. Funds are automatically processed and allocated according to your strategy.",
      details: ["Accept USDT deposits", "Automatic fund processing", "Real-time allocation", "Transparent fee deduction"]
    },
    {
      step: "03",
      title: "Asset Allocation",
      description: "Deposited funds are automatically swapped into configured assets using DEX aggregators for optimal pricing and execution.",
      details: ["DEX aggregator integration", "Optimal price discovery", "Automatic rebalancing", "Secure asset custody"]
    },
    {
      step: "04",
      title: "ETF Token Issuance", 
      description: "Users receive ETF tokens representing proportional ownership in the vault. Tokens are visible in wallets and tradeable.",
      details: ["Proportional token minting", "Wallet integration", "Tradeable on DEXs", "Real-time NAV tracking"]
    },
    {
      step: "05",
      title: "Monitoring & Redemption",
      description: "Comprehensive dashboard for tracking performance. Users can redeem tokens for underlying assets or convert to USDT anytime.",
      details: ["Real-time performance tracking", "Asset allocation monitoring", "Flexible redemption options", "Historical analytics"]
    }
  ];

  const securityFeatures = [
    "Smart contract audits by leading security firms",
    "Multi-signature treasury management",
    "Time-locked upgrades with community governance",
    "Bug bounty program with ongoing rewards",
    "Formal verification of critical functions",
    "Insurance coverage for smart contract risks"
  ];

  const stats = [
    { label: "Total Value Locked", value: "$142.8M" },
    { label: "Active Vaults", value: "1,247" },
    { label: "Users Worldwide", value: "23,891" },
    { label: "Countries Supported", value: "180+" }
  ];

  return (
    <div className="min-h-screen py-24">
      <div className="container mx-auto px-4 lg:px-8">
        {/* Hero Section */}
        <section className="text-center space-y-8 mb-24">
          <div className="space-y-4">
            <Badge variant="secondary" className="mb-4">
              About DeFiMarkets
            </Badge>
            <h1 className="text-5xl md:text-6xl font-bold">
              The Future of 
              <span className="bg-gradient-primary bg-clip-text text-transparent"> DeFi Investing</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              DeFiMarkets is a permissionless DeFi platform that enables anyone to create, manage, and invest in custom ETF vaults with institutional-grade infrastructure.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Button variant="hero" size="lg" asChild>
              <Link to="/create-vault">
                Start Building
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link to="/vaults">
                Explore Vaults
              </Link>
            </Button>
          </div>
        </section>

        {/* Stats */}
        <section className="mb-24">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, index) => (
              <Card key={index} className="glass-card text-center">
                <CardContent className="pt-6">
                  <p className="text-3xl font-bold text-primary mb-2">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mb-24">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl font-bold">Why Choose DeFiMarkets?</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Built for the next generation of DeFi investors with enterprise-grade security and user-friendly design
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="glass-card hover-glow transition-all duration-normal">
                <CardHeader>
                  <div className="p-3 rounded-lg bg-gradient-primary w-fit mb-4">
                    {feature.icon}
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* How It Works */}
        <section className="mb-24">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl font-bold">How DeFiMarkets Works</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              A complete workflow from vault creation to redemption
            </p>
          </div>
          
          <div className="space-y-16">
            {workflowSteps.map((step, index) => (
              <div key={index} className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center ${
                index % 2 === 1 ? 'lg:grid-flow-col-dense' : ''
              }`}>
                <div className={`space-y-6 ${index % 2 === 1 ? 'lg:col-start-2' : ''}`}>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-lg">
                      {step.step}
                    </div>
                    <h3 className="text-2xl font-bold">{step.title}</h3>
                  </div>
                  <p className="text-lg text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                  <ul className="space-y-2">
                    {step.details.map((detail, detailIndex) => (
                      <li key={detailIndex} className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-success" />
                        <span className="text-muted-foreground">{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={`${index % 2 === 1 ? 'lg:col-start-1 lg:row-start-1' : ''}`}>
                  <Card className="glass-card p-8">
                    <div className="h-64 flex items-center justify-center">
                      <div className="text-center space-y-4">
                        <TrendingUp className="w-16 h-16 text-primary mx-auto" />
                        <p className="text-muted-foreground">Step {step.step} Visualization</p>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Security */}
        <section className="mb-24">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl font-bold">Security First</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Your funds security is our top priority with multiple layers of protection
            </p>
          </div>
          
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-2xl">
                <Shield className="w-8 h-8 text-primary" />
                Security Features
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {securityFeatures.map((feature, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-success" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* CTA */}
        <section className="text-center space-y-8">
          <div className="space-y-4">
            <h2 className="text-4xl font-bold">Ready to Get Started?</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Join thousands of users building the future of decentralized finance
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Button variant="hero" size="lg" asChild>
              <Link to="/create-vault">
                Create Your First Vault
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
            </Button>
            <Button variant="glass" size="lg" asChild>
              <Link to="/vaults">
                Browse Existing Vaults
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default About;