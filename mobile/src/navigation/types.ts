export type SnagsStackParamList = {
  SnagsHome:
    | {
        projectId?: number
        floorId?: number
        locationId?: number
        locationName?: string
      }
    | undefined
  SnagCreate:
    | {
        prefill?: {
          projectId?: number
          buildingId?: number
          floorId?: number
          locationId?: number
          pinX?: number
          pinY?: number
        }
      }
    | undefined
  SnagDetail: {
    localId?: number
    serverId?: number
  }
  FloorMap: undefined
  AnnotateAttachment: {
    snagServerId: number
    assetUri: string
    fileName: string
    mimeType: string
    fileSize: number
    width?: number
    height?: number
  }
  InspectionsList: undefined
  InspectionDetail: {
    inspectionId?: number
  }
  HandoverRequestsList: undefined
  HandoverDetail: {
    requestId: number
  }
  HandoverCreate: undefined
  AuditTrail: undefined
  Search: undefined
}

export type RootTabParamList = {
  Home: undefined
  Snags: undefined
  Equipment: undefined
  Conflicts: undefined
  Notifications: undefined
  Settings: undefined
}

export type RootDrawerParamList = {
  MainTabs: undefined
}
