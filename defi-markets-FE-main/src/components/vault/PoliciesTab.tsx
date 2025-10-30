import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PoliciesTab = () => {
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Vault Policies</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">
          Policy information coming soon...
        </p>
      </CardContent>
    </Card>
  );
};

export default PoliciesTab;
