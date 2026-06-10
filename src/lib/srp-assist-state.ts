export type SrpAssistActionState = {
  assist: {
    assistStatus: string;
    calculatedEligibleAmount: string;
    calculationSource: string;
    detectedShipName: string;
    detectedShipTypeId: string;
    insurancePayout: string;
    killmailId: string;
    killmailTotalValue: string;
    selectedShipName: string;
    selectedShipTypeId: string;
    shipDetectionSource: string;
    srpAssistError: string;
    warnings: string;
  };
  fields: {
    characterName: string;
    doctrineName: string;
    killmailUrl: string;
    lossDate: string;
    lossValue: string;
    notes: string;
    requestedAmount: string;
    selectedShipName: string;
    selectedShipTypeId: string;
  };
  message: string;
  status: "idle" | "success" | "warning" | "error";
};

export const initialSrpAssistActionState: SrpAssistActionState = {
  assist: {
    assistStatus: "",
    calculatedEligibleAmount: "",
    calculationSource: "",
    detectedShipName: "",
    detectedShipTypeId: "",
    insurancePayout: "",
    killmailId: "",
    killmailTotalValue: "",
    selectedShipName: "",
    selectedShipTypeId: "",
    shipDetectionSource: "",
    srpAssistError: "",
    warnings: ""
  },
  fields: {
    characterName: "",
    doctrineName: "",
    killmailUrl: "",
    lossDate: "",
    lossValue: "",
    notes: "",
    requestedAmount: "",
    selectedShipName: "",
    selectedShipTypeId: ""
  },
  message: "",
  status: "idle"
};
