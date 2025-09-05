export interface Document {
  name: string;
  fileName: string;
  signedUrl: string;
}

export interface InvoiceAndDocuments {
  shipmentNumber: string;
  dispatchedOn: string;
  documents: Document[];
  pbOrder: boolean;
}
