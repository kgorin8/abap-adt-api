import { AdtHTTP } from "../AdtHTTP"
import {
  decodeEntity,
  fullParse,
  xmlArray,
  xmlFlatArray,
  xmlNodeAttr
} from "../utilities"

export interface UnitTestStackEntry {
  "adtcore:uri": string
  "adtcore:type": string
  "adtcore:name": string
  "adtcore:description": string
}

export enum UnitTestAlertKind {
  exception = "exception",
  failedAssertion = "failedAssertion",
  warning = "warning"
}
export enum UnitTestSeverity {
  critical = "critical",
  fatal = "fatal",
  tolerable = "tolerable",
  tolerant = "tolerant"
}
export interface UnitTestAlert {
  kind: UnitTestAlertKind
  severity: UnitTestSeverity
  details: string[]
  stack: UnitTestStackEntry[]
}
export interface UnitTestMethod {
  "adtcore:uri": string
  "adtcore:type": string
  "adtcore:name": string
  executionTime: number
  uriType: string
  navigationUri: string
  unit: string
  alerts: UnitTestAlert[]
}

export interface UnitTestClass {
  "adtcore:uri": string
  "adtcore:type": string
  "adtcore:name": string
  uriType: string
  navigationUri: string
  durationCategory: string
  riskLevel: string
  testmethods: UnitTestMethod[]
}
export async function runUnitTest(h: AdtHTTP, url: string) {
  const headers = { "Content-Type": "application/*", Accept: "application/*" }
  const body = `<?xml version="1.0" encoding="UTF-8"?>
  <aunit:runConfiguration xmlns:aunit="http://www.sap.com/adt/aunit">
  <external>
    <coverage active="false"/>
  </external>
  <options>
    <uriType value="semantic"/>
    <testDeterminationStrategy sameProgram="true" assignedTests="false"/>
  </options>
  <adtcore:objectSets xmlns:adtcore="http://www.sap.com/adt/core">
    <objectSet kind="inclusive">
      <adtcore:objectReferences>
        <adtcore:objectReference adtcore:uri="${url}"/>
      </adtcore:objectReferences>
    </objectSet>
  </adtcore:objectSets>
</aunit:runConfiguration>`
  const response = await h.request("/sap/bc/adt/abapunit/testruns", {
    method: "POST",
    headers,
    body
  })
  const raw = fullParse(response.body)
  const parseDetail = (alert: any) =>
    xmlArray(alert, "details", "detail").reduce((result: string[], d: any) => {
      const main = decodeEntity((d && d["@_text"]) || "")
      const children = xmlArray(d, "details", "detail")
        .map((dd: any) => (dd && `\n\t${dd["@_text"]}`) || "")
        .join("")
      return main ? [...result, main + children] : result
    }, [])
  const parseStack = (alert: any) =>
    xmlArray(alert, "stack", "stackEntry").map(x => {
      const entry = xmlNodeAttr(x)
      entry["adtcore:description"] = decodeEntity(entry["adtcore:description"])
      return entry
    })
  const parseAlert = (alert: any) => ({
    ...xmlNodeAttr(alert),
    details: parseDetail(alert),
    stack: parseStack(alert)
  })
  const parseMethod = (method: any) => ({
    ...xmlNodeAttr(method),
    alerts: xmlArray(method, "alerts", "alert").map(parseAlert)
  })

  const classes: UnitTestClass[] = xmlFlatArray(
    raw,
    "aunit:runResult",
    "program",
    "testClasses",
    "testClass"
  ).map(c => {
    return {
      ...xmlNodeAttr(c),
      testmethods: xmlFlatArray(c, "testMethods", "testMethod").map(parseMethod)
    }
  })

  return classes
}
