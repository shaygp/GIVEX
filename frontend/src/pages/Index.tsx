// src/pages/Index.tsx - VERSION FINALE
import { TradingTerminal } from "../components/TradingTerminal";
import { WalletConnect } from "../components/walletConnect";
import { VaultDashboard } from "../components/VaultDashboard";
import { ImpactPool } from "../components/ImpactPool";
import { useImpactPool } from "../hooks/useImpactPool";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Index = () => {
  const { stats, donateToPool, mintCertificate } = useImpactPool();
  const { toast } = useToast();

  const handleDonation = async (amount: string) => {
    const result = await donateToPool(amount);
    if (result.success) {
      toast({
        title: "Donation successful",
        description: `Successfully donated ${amount} WHBAR to impact projects`,
      });
    } else {
      toast({
        title: "Donation failed",
        description: result.error,
        variant: "destructive",
      });
    }
  };

  const handleCertificateMint = async (certificateId: string) => {
    const result = await mintCertificate(certificateId);
    if (result.success) {
      toast({
        title: "Certificate minted",
        description: "Impact certificate has been minted as HTS token",
      });
    } else {
      toast({
        title: "Minting failed",
        description: result.error,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-foreground rounded-sm flex items-center justify-center">
              <span className="text-background font-bold text-sm">G</span>
            </div>
            <h1 className="text-xl font-semibold">GIVEX</h1>
          </div>
          <WalletConnect />
        </div>
      </header>

      <main className="container mx-auto py-6">
        <Tabs defaultValue="vault" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="vault">Vault Dashboard</TabsTrigger>
            <TabsTrigger value="trading">Trading Terminal</TabsTrigger>
            <TabsTrigger value="impact">Impact Pool</TabsTrigger>
          </TabsList>

          <TabsContent value="vault" className="space-y-4">
            <VaultDashboard />
          </TabsContent>

          <TabsContent value="impact" className="space-y-4">
            <ImpactPool
              userBalance={stats?.totalDonated || "0.00"}
              totalPoolBalance={stats?.totalPoolBalance || "0.00"}
              onDonateAmount={handleDonation}
              onWithdrawCertificate={handleCertificateMint}
            />
          </TabsContent>

          <TabsContent value="trading" className="space-y-4">
            <TradingTerminal />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
