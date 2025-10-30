import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Wallet, Plus, Edit, Trash2, Search, Filter, Eye } from "lucide-react";

const walletSchema = z.object({
  address: z.string().min(42, "Invalid wallet address").max(42, "Invalid wallet address"),
  label: z.string().min(1, "Label is required").max(50, "Label too long"),
  roles: z.array(z.string()).min(1, "At least one role is required"),
});

type WalletForm = z.infer<typeof walletSchema>;

interface WalletRecord {
  id: string;
  address: string;
  label: string;
  roles: string[];
  balance: string;
  created_at: string;
  created_by: string;
}

const ROLES = ["admin", "operator", "auditor", "treasury"];

const Wallets = () => {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingWallet, setEditingWallet] = useState<WalletRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [userRole] = useState("admin"); // Mock user role

  // Mock wallet data
  const [wallets, setWallets] = useState<WalletRecord[]>([
    {
      id: "1",
      address: "0x742d35Cc6735C2532B3441723F2A4f8d6b6C8C8E",
      label: "Treasury Main",
      roles: ["treasury", "admin"],
      balance: "1,250.5 ETH",
      created_at: "2024-01-15T10:30:00Z",
      created_by: "admin@defimarkets.com"
    },
    {
      id: "2",
      address: "0x8ba1f109551bD432803012645Hac136c9eb20000",
      label: "Operations Wallet",
      roles: ["operator"],
      balance: "45.2 ETH",
      created_at: "2024-01-14T09:15:00Z",
      created_by: "admin@defimarkets.com"
    },
    {
      id: "3",
      address: "0x1A4B67e77EF8E3f8E6F4c1d5EfF7A8B9C0D1E2F3",
      label: "Audit Wallet",
      roles: ["auditor"],
      balance: "0.1 ETH",
      created_at: "2024-01-13T14:20:00Z",
      created_by: "admin@defimarkets.com"
    }
  ]);

  const form = useForm<WalletForm>({
    resolver: zodResolver(walletSchema),
    defaultValues: {
      address: "",
      label: "",
      roles: [],
    },
  });

  const filteredWallets = wallets.filter(wallet => {
    const matchesSearch = wallet.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wallet.label.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === "all" || wallet.roles.includes(roleFilter);
    return matchesSearch && matchesRole;
  });

  const onSubmit = async (data: WalletForm) => {
    try {
      if (editingWallet) {
        // Update existing wallet
        setWallets(prev => prev.map(w =>
          w.id === editingWallet.id
            ? { ...w, ...data, balance: w.balance } // Keep existing balance
            : w
        ));
        toast({
          title: "Wallet Updated",
          description: `Wallet ${data.label} has been updated successfully.`,
        });
      } else {
        // Create new wallet
        const newWallet: WalletRecord = {
          id: Date.now().toString(),
          address: data.address,
          label: data.label,
          roles: data.roles,
          balance: "0 ETH",
          created_at: new Date().toISOString(),
          created_by: "admin@defimarkets.com"
        };
        setWallets(prev => [newWallet, ...prev]);
        toast({
          title: "Wallet Created",
          description: `Wallet ${data.label} has been created successfully.`,
        });
      }

      setIsDialogOpen(false);
      setEditingWallet(null);
      form.reset();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save wallet. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (wallet: WalletRecord) => {
    setEditingWallet(wallet);
    form.reset({
      address: wallet.address,
      label: wallet.label,
      roles: wallet.roles,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (wallet: WalletRecord) => {
    setWallets(prev => prev.filter(w => w.id !== wallet.id));
    toast({
      title: "Wallet Deleted",
      description: `Wallet ${wallet.label} has been deleted.`,
    });
  };

  const canModify = userRole === "admin";
  const canView = ["admin", "operator", "auditor"].includes(userRole);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Wallet Management</h1>
          <p className="text-muted-foreground">
            Manage platform wallets and their permissions
          </p>
        </div>

        {canModify && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Wallet
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingWallet ? "Edit Wallet" : "Add New Wallet"}
                </DialogTitle>
                <DialogDescription>
                  {editingWallet ? "Update wallet details and roles." : "Create a new wallet with roles and permissions."}
                </DialogDescription>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Wallet Address</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="0x..."
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="label"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Label</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Treasury Main"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="roles"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Roles</FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            {ROLES.map((role) => (
                              <label key={role} className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  checked={field.value.includes(role)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      field.onChange([...field.value, role]);
                                    } else {
                                      field.onChange(field.value.filter(r => r !== role));
                                    }
                                  }}
                                  className="rounded border-border-subtle"
                                />
                                <span className="text-sm capitalize">{role}</span>
                              </label>
                            ))}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsDialogOpen(false);
                        setEditingWallet(null);
                        form.reset();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit">
                      {editingWallet ? "Update" : "Create"} Wallet
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Filters */}
      <Card className="bg-surface-1/50 backdrop-blur-sm border-border-subtle">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by address or label..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {ROLES.map(role => (
                  <SelectItem key={role} value={role} className="capitalize">
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Wallets Table */}
      <Card className="bg-surface-1/50 backdrop-blur-sm border-border-subtle">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Wallets ({filteredWallets.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Address</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Created</TableHead>
                {canModify && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredWallets.map((wallet) => (
                <TableRow key={wallet.id}>
                  <TableCell>
                    <code className="text-xs bg-surface-2/50 px-2 py-1 rounded">
                      {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                    </code>
                  </TableCell>
                  <TableCell className="font-medium">{wallet.label}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {wallet.roles.map(role => (
                        <Badge key={role} variant="secondary" className="text-xs capitalize">
                          {role}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{wallet.balance}</TableCell>
                  <TableCell>
                    {new Date(wallet.created_at).toLocaleDateString()}
                  </TableCell>
                  {canModify && (
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(wallet)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(wallet)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Wallets;