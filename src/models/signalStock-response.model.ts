type AccountType = "distributor" | "retailer";

type SignalSeverity = "red" | "orange" | "grey" | "nocolor";

interface Signal {
    tag: string;
    severity: SignalSeverity;
}

interface Account {
    totalPurchases: number | null;
    soldViaInfluencers: number | null;
    soldToRetailers: number | null;
    soldAtSites: number | null;
    secondarySales: number | null;
    retailers: Account[] | null;
    openingStock: number | null;
    currentStock: number | null;
    accountType: string;
    accountName: string;
    accountId: string;
    signals?: Signal[];
    totalOpportunities: number | null;
    successOpportunities: number | null;
    newOpportunities: number | null;
    lostOpportunities: number | null;
    accountTag?: string;
}

interface SignalAccount {
    accountId: string;
    accountName: string;
    accountType: string;
}

interface SignalSummary {
    count: number;
    severity: SignalSeverity;
    accounts: SignalAccount[];
}