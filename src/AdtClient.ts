import { isString } from "util"
import { adtException } from "./AdtException"
import { AdtHTTP, ClientOptions, session_types, BearerFetcher } from "./AdtHTTP"

import {
  AbapClassStructure,
  AbapObjectStructure,
  ActivationResult,
  AdtDiscoveryResult,
  CreatableTypeIds,
  FixProposal,
  GitRepo,
  GitStaging,
  InactiveObject,
  NewObjectOptions,
  NodeParents,
  NodeStructure,
  PackageValueHelpType,
  PrettyPrinterStyle,
  SyntaxCheckResult,
  UsageReference,
  ValidateOptions,
  abapDocumentation,
  activate,
  adtCompatibilityGraph,
  adtCoreDiscovery,
  adtDiscovery,
  annotationDefinitions,
  checkRepo,
  classComponents,
  classIncludes,
  codeCompletion,
  codeCompletionElement,
  codeCompletionFull,
  createObject,
  createRepo,
  createTestInclude,
  createTransport,
  ddicElement,
  ddicRepositoryAccess,
  deleteObject,
  externalRepoInfo,
  findDefinition,
  findObjectPath,
  fixEdits,
  fixProposals,
  fragmentMappings,
  getObjectSource,
  gitRepos,
  isClassStructure,
  isCreatableTypeId,
  isPackageType,
  loadTypes,
  lock,
  mainPrograms,
  nodeContents,
  objectRegistrationInfo,
  objectStructure,
  objectTypes,
  packageSearchHelp,
  prettyPrinter,
  prettyPrinterSetting,
  pullRepo,
  pushRepo,
  revisions,
  runUnitTest,
  searchObject,
  setObjectSource,
  setPrettyPrinterSetting,
  stageRepo,
  syntaxCheck,
  syntaxCheckCDS,
  syntaxCheckTypes,
  systemUsers,
  transportAddUser,
  transportDelete,
  transportInfo,
  transportReference,
  transportRelease,
  transportSetOwner,
  typeHierarchy,
  unLock,
  unlinkRepo,
  usageReferenceSnippets,
  usageReferences,
  userTransports,
  validateNewObject,
  remoteRepoInfo,
  switchRepoBranch,
  MainInclude,
  TransportInfo,
  AdtCompatibilityGraph,
  AdtCoreDiscoveryResult,
  AdtLock,
  ClassComponent,
  CompletionElementInfo,
  CompletionProposal,
  DdicElement,
  DdicObjectReference,
  DefinitionLocation,
  Delta,
  FragmentLocation,
  GitExternalInfo,
  GitObject,
  GitRemoteInfo,
  HierarchyNode,
  ObjectType,
  ObjectTypeDescriptor,
  PackageValueHelpResult,
  PathStep,
  PrettyPrinterSettings,
  Revision,
  SearchResult,
  SystemUser,
  TransportAddUserResponse,
  TransportOwnerResponse,
  TransportReleaseReport,
  TransportsOfUser,
  UnitTestClass,
  UsageReferenceSnippet,
  ValidationResult,
  inactiveObjects
} from "./api"
import { followUrl } from "./utilities"

export function createSSLConfig(
  allowUnauthorized: boolean,
  ca?: string
): ClientOptions {
  return { ca, rejectUnauthorized: !allowUnauthorized }
}
interface HttpOptions {
  baseUrl: string
  username: string
  password: string | BearerFetcher
  client: string
  language: string
  options: ClientOptions
}
export class ADTClient {
  private discovery?: AdtDiscoveryResult[]
  private fetcher?: () => Promise<string>

  public get httpClient() {
    return this.h
  }

  public static mainInclude(
    object: AbapObjectStructure,
    withDefault = true
  ): string {
    // packages don't really have any include
    if (isPackageType(object.metaData["adtcore:type"])) return object.objectUrl
    if (isClassStructure(object)) {
      const mainInclude = object.includes.find(
        x => x["class:includeType"] === "main"
      )
      const mainLink =
        mainInclude &&
        (mainInclude.links.find(x => x.type === "text/plain") ||
          mainInclude.links.find(x => !x.type)) // CDS have no type for the plain text link...
      if (mainLink) return followUrl(object.objectUrl, mainLink.href)
    } else {
      const source = object.metaData["abapsource:sourceUri"]
      if (source) return followUrl(object.objectUrl, source)
      const mainLink = object.links.find(x => x.type === "text/plain")
      if (mainLink) return followUrl(object.objectUrl, mainLink.href)
    }
    return withDefault
      ? followUrl(object.objectUrl, "/source/main")
      : object.objectUrl
  }

  public static classIncludes(clas: AbapClassStructure) {
    const includes = new Map<classIncludes, string>()
    for (const i of clas.includes) {
      const mainLink = i.links.find(x => x.type === "text/plain")
      includes.set(
        i["class:includeType"] as classIncludes,
        followUrl(clas.objectUrl, mainLink!.href)
      )
    }
    return includes
  }

  private h: AdtHTTP
  private pClone?: ADTClient
  private pIsClone?: boolean
  private options: HttpOptions

  /**
   * Create an ADT client
   *
   * @argument baseUrl  Base url, i.e. http://vhcalnplci.local:8000
   * @argument username SAP logon user
   * @argument password Password
   * @argument client   Login client (optional)
   * @argument language Language key (optional)
   */
  constructor(
    baseUrl: string,
    username: string,
    password: string | BearerFetcher,
    client: string = "",
    language: string = "",
    options: ClientOptions = {}
  ) {
    if (!(baseUrl && username && password))
      throw new Error(
        "Invalid ADTClient configuration: url, login and password are required"
      )
    if (typeof password !== "string") password = this.wrapFetcher(password)
    this.options = { baseUrl, username, password, client, language, options }
    this.h = this.createHttp()
  }

  private createHttp() {
    const o = this.options
    return new AdtHTTP(
      o.baseUrl,
      o.username,
      o.password,
      o.client,
      o.language,
      o.options
    )
  }

  private wrapFetcher: (f: BearerFetcher) => BearerFetcher = fetcher => {
    let fetchBearer: Promise<string>
    if (this.fetcher) return this.fetcher
    this.fetcher = () => {
      fetchBearer = fetchBearer || fetcher()
      return fetchBearer
    }
    return this.fetcher
  }

  public get statelessClone() {
    if (this.pIsClone) return this
    if (!this.pClone) {
      const pw = this.fetcher || this.password
      this.pClone = new ADTClient(
        this.baseUrl,
        this.username,
        pw,
        this.client,
        this.language,
        this.options.options
      )
      this.pClone.pIsClone = true
    }
    return this.pClone
  }
  public get stateful() {
    return this.h.stateful
  }
  public set stateful(stateful: session_types) {
    if (this.pIsClone)
      throw adtException("Stateful sessions not allowed in stateless clones")
    this.h.stateful = stateful
  }

  public get loggedin() {
    return this.h.loggedin
  }

  public get isStateful() {
    return this.h.isStateful
  }

  public get csrfToken() {
    return this.h.csrfToken
  }
  public get baseUrl() {
    return this.h.baseUrl
  }
  public get client() {
    return this.h.client
  }
  public get language() {
    return this.h.language
  }
  public get username() {
    return this.h.username
  }
  private get password() {
    return this.h.password
  }

  /**
   * Logs on an ADT server. parameters provided on creation
   */
  public login() {
    // if loggedoff create a new client
    if (!this.h.username) this.h = this.createHttp()
    return this.h.login()
  }
  /**
   * Logs out current user, clearing cookies
   * NOTE: you won't be able to login again with this client
   *
   * @memberof ADTClient
   */
  public logout() {
    return this.h.logout()
  }
  public dropSession() {
    return this.h.dropSession()
  }

  public get sessionID() {
    const cookies = this.h.cookies() || []
    const sc = cookies.find(c => !!c.key.match(/SAP_SESSIONID/))
    return sc ? sc.value : ""
  }

  public nodeContents(
    // tslint:disable: variable-name
    parent_type: NodeParents,
    parent_name?: string,
    user_name?: string,
    parent_tech_name?: string
  ): Promise<NodeStructure> {
    return nodeContents(
      this.h,
      parent_type,
      parent_name,
      user_name,
      parent_tech_name
    )
  }

  public async reentranceTicket(): Promise<string> {
    const response = await this.h.request(
      "/sap/bc/adt/security/reentranceticket"
    )
    return response.body
  }

  public transportInfo(
    objSourceUrl: string,
    devClass?: string,
    operation: string = "I"
  ) {
    return transportInfo(this.h, objSourceUrl, devClass, operation)
  }

  public createTransport(
    objSourceUrl: string,
    REQUEST_TEXT: string,
    DEVCLASS: string,
    transportLayer?: string
  ) {
    return createTransport(
      this.h,
      objSourceUrl,
      REQUEST_TEXT,
      DEVCLASS,
      "I",
      transportLayer
    )
  }

  public objectStructure(objectUrl: string): Promise<AbapObjectStructure> {
    return objectStructure(this.h, objectUrl)
  }
  public activate(
    object: InactiveObject | InactiveObject[],
    preauditRequested?: boolean
  ): Promise<ActivationResult>
  public activate(
    objectName: string,
    objectUrl: string,
    mainInclude?: string,
    preauditRequested?: boolean
  ): Promise<ActivationResult>
  public activate(
    objectNameOrObjects: string | InactiveObject | InactiveObject[],
    objectUrlOrPreauditReq: string | boolean = true,
    mainInclude?: string,
    preauditRequested = true
  ) {
    if (isString(objectNameOrObjects))
      return activate(
        this.h,
        objectNameOrObjects,
        objectUrlOrPreauditReq as string, // validated downstream
        mainInclude,
        preauditRequested
      )
    else
      return activate(
        this.h,
        objectNameOrObjects,
        objectUrlOrPreauditReq as boolean // validated downstream
      )
  }

  public inactiveObjects() {
    return inactiveObjects(this.h)
  }

  public mainPrograms(includeUrl: string) {
    return mainPrograms(this.h, includeUrl)
  }

  public lock(objectUrl: string, accessMode: string = "MODIFY") {
    return lock(this.h, objectUrl, accessMode)
  }
  public unLock(objectUrl: string, lockHandle: string) {
    return unLock(this.h, objectUrl, lockHandle)
  }
  /**
   * Retrieves a resource content (i.e. a program's source code)
   *
   * @param objectSourceUrl Resource URL
   * @param gitUser Username, only used for abapGit objects
   * @param gitPassword password, only used for abapGit objects
   */
  public getObjectSource(
    objectSourceUrl: string,
    gitUser?: string,
    gitPassword?: string
  ) {
    return getObjectSource(this.h, objectSourceUrl, gitUser, gitPassword)
  }

  public setObjectSource(
    objectSourceUrl: string,
    source: string,
    lockHandle: string,
    transport?: string
  ) {
    return setObjectSource(
      this.h,
      objectSourceUrl,
      source,
      lockHandle,
      transport
    )
  }

  /**
   * Search object by name pattern
   *
   * @param {string} query     case sensitive in older systems, no wildcard added
   * @param {string} [objType] if passed, only the first part is used i.e. PROG rather than PROG/P
   * @param {number} [max=100] max number of results
   * @returns
   * @memberof ADTClient
   */
  public searchObject(query: string, objType?: string, max: number = 100) {
    return searchObject(this.h, query, objType, max)
  }

  public findObjectPath(objectUrl: string) {
    return findObjectPath(this.h, objectUrl)
  }

  public validateNewObject(options: ValidateOptions) {
    return validateNewObject(this.h, options)
  }

  public createObject(
    objtype: CreatableTypeIds,
    name: string,
    parentName: string,
    description: string,
    parentPath: string,
    responsible?: string,
    transport?: string
  ): Promise<void>
  public createObject(options: NewObjectOptions): Promise<void>
  public createObject(
    optionsOrType: NewObjectOptions | CreatableTypeIds,
    name?: string,
    parentName?: string,
    description?: string,
    parentPath?: string,
    responsible: string = "",
    transport: string = ""
  ) {
    if (isCreatableTypeId(optionsOrType)) {
      if (!name || !parentName || !parentPath || !description)
        throw adtException("")
      return createObject(this.h, {
        description,
        name,
        objtype: optionsOrType as CreatableTypeIds,
        parentName,
        parentPath,
        responsible,
        transport
      })
    } else return createObject(this.h, optionsOrType)
  }

  public async featureDetails(title: string) {
    if (!this.discovery) this.discovery = await this.adtDiscovery()
    return this.discovery.find(d => d.title === title)
  }

  public async collectionFeatureDetails(url: string) {
    if (!this.discovery) this.discovery = await this.adtDiscovery()
    return this.discovery.find(f =>
      f.collection.find(c => c.templateLinks.find(l => l.template === url))
    )
  }

  public createTestInclude(clas: string, lockHandle: string, transport = "") {
    return createTestInclude(this.h, clas, lockHandle, transport)
  }

  public objectRegistrationInfo(objectUrl: string) {
    return objectRegistrationInfo(this.h, objectUrl)
  }

  public deleteObject(
    objectUrl: string,
    lockHandle: string,
    transport?: string
  ) {
    return deleteObject(this.h, objectUrl, lockHandle, transport)
  }

  public loadTypes() {
    return loadTypes(this.h)
  }

  public adtDiscovery() {
    return adtDiscovery(this.h)
  }
  public adtCoreDiscovery() {
    return adtCoreDiscovery(this.h)
  }
  public adtCompatibiliyGraph() {
    return adtCompatibilityGraph(this.h)
  }

  public syntaxCheckTypes() {
    return syntaxCheckTypes(this.h)
  }
  public syntaxCheck(cdsUrl: string): Promise<SyntaxCheckResult[]>
  public syntaxCheck(
    url: string,
    mainUrl: string,
    content: string,
    mainProgram?: string,
    version?: string
  ): Promise<SyntaxCheckResult[]>
  public syntaxCheck(
    url: string,
    mainUrl?: string,
    content?: string,
    mainProgram: string = "",
    version: string = "active"
  ): Promise<SyntaxCheckResult[]> {
    if (url.match(/^\/sap\/bc\/adt\/((ddic\/ddlx?)|(acm\/dcl))\/sources\//))
      return syntaxCheckCDS(this.h, url, mainUrl, content)
    else {
      if (!mainUrl || !content)
        throw new Error("mainUrl and content are required for syntax check")
      return syntaxCheck(this.h, url, mainUrl, content, mainProgram, version)
    }
  }

  public codeCompletion(
    sourceUrl: string,
    source: string,
    line: number,
    column: number
  ) {
    return codeCompletion(this.h, sourceUrl, source, line, column)
  }
  public codeCompletionFull(
    sourceUrl: string,
    source: string,
    line: number,
    column: number,
    patternKey: string
  ) {
    return codeCompletionFull(
      this.h,
      sourceUrl,
      source,
      line,
      column,
      patternKey
    )
  }

  public async runClass(className: string) {
    const response = await this.h.request(
      "/sap/bc/adt/oo/classrun/" + className.toUpperCase(),
      {
        method: "POST"
      }
    )
    return response.body
  }

  /**
   * Read code completion elements
   * Will fail on older systems where this returns HTML fragments rather than XML
   *
   * @param {string} sourceUrl
   * @param {string} source
   * @param {number} line
   * @param {number} column
   * @returns
   * @memberof ADTClient
   */
  public codeCompletionElement(
    sourceUrl: string,
    source: string,
    line: number,
    column: number
  ) {
    return codeCompletionElement(this.h, sourceUrl, source, line, column)
  }

  public findDefinition(
    url: string,
    source: string,
    line: number,
    startCol: number,
    endCol: number,
    implementation = false,
    mainProgram = ""
  ) {
    return findDefinition(
      this.h,
      url,
      source,
      line,
      startCol,
      endCol,
      implementation,
      mainProgram
    )
  }

  public usageReferences(url: string, line?: number, column?: number) {
    return usageReferences(this.h, url, line, column)
  }

  public usageReferenceSnippets(references: UsageReference[]) {
    return usageReferenceSnippets(this.h, references)
  }

  public fixProposals(
    url: string,
    source: string,
    line: number,
    column: number
  ) {
    return fixProposals(this.h, url, source, line, column)
  }
  public fixEdits(proposal: FixProposal, source: string) {
    return fixEdits(this.h, proposal, source)
  }
  public runUnitTest(url: string) {
    return runUnitTest(this.h, url)
  }

  public classComponents(url: string) {
    return classComponents(this.h, url)
  }

  public fragmentMappings(url: string, type: string, name: string) {
    return fragmentMappings(this.h, url, type, name)
  }

  public objectTypes() {
    return objectTypes(this.h)
  }

  public prettyPrinterSetting() {
    return prettyPrinterSetting(this.h)
  }

  public setPrettyPrinterSetting(indent: boolean, style: PrettyPrinterStyle) {
    return setPrettyPrinterSetting(this.h, indent, style)
  }

  public prettyPrinter(source: string) {
    return prettyPrinter(this.h, source)
  }

  public typeHierarchy(
    url: string,
    body: string,
    line: number,
    offset: number,
    superTypes = false
  ) {
    return typeHierarchy(this.h, url, body, line, offset, superTypes)
  }

  public userTransports(user: string, targets = true) {
    return userTransports(this.h, user, targets)
  }

  public transportDelete(transportNumber: string) {
    return transportDelete(this.h, transportNumber)
  }

  public transportRelease(
    transportNumber: string,
    ignoreLocks = false,
    IgnoreATC = false
  ) {
    return transportRelease(this.h, transportNumber, ignoreLocks, IgnoreATC)
  }

  public transportSetOwner(transportNumber: string, targetuser: string) {
    return transportSetOwner(this.h, transportNumber, targetuser)
  }

  public transportAddUser(transportNumber: string, user: string) {
    return transportAddUser(this.h, transportNumber, user)
  }

  public systemUsers() {
    return systemUsers(this.h)
  }
  public transportReference(
    pgmid: string,
    obj_wbtype: string,
    obj_name: string
  ) {
    return transportReference(this.h, pgmid, obj_wbtype, obj_name)
  }

  public revisions(
    objectUrl: string | AbapObjectStructure,
    clsInclude?: classIncludes
  ) {
    return revisions(this.h, objectUrl, clsInclude)
  }

  public abapDocumentation(
    objectUri: string,
    body: string,
    line: number,
    column: number,
    language = "EN"
  ) {
    return abapDocumentation(this.h, objectUri, body, line, column, language)
  }
  public packageSearchHelp(type: PackageValueHelpType, name = "*") {
    return packageSearchHelp(this.h, type, name)
  }
  public gitRepos() {
    return gitRepos(this.h)
  }

  public gitExternalRepoInfo(repourl: string, user = "", password = "") {
    return externalRepoInfo(this.h, repourl, user, password)
  }

  public gitCreateRepo(
    packageName: string,
    repourl: string,
    branch = "refs/heads/master",
    transport = "",
    user = "",
    password = ""
  ) {
    return createRepo(
      this.h,
      packageName,
      repourl,
      branch,
      transport,
      user,
      password
    )
  }

  public gitPullRepo(
    repoId: string,
    branch = "refs/heads/master",
    transport = "",
    user = "",
    password = ""
  ) {
    return pullRepo(this.h, repoId, branch, transport, user, password)
  }

  public gitUnlinkRepo(repoId: string) {
    return unlinkRepo(this.h, repoId)
  }

  public stageRepo(repo: GitRepo, user = "", password = "") {
    return stageRepo(this.h, repo, user, password)
  }

  public pushRepo(
    repo: GitRepo,
    staging: GitStaging,
    user = "",
    password = ""
  ) {
    return pushRepo(this.h, repo, staging, user, password)
  }

  public checkRepo(repo: GitRepo, user = "", password = "") {
    return checkRepo(this.h, repo, user, password)
  }

  /**
   * @deprecated since 1.2.1, duplicate of externalRepoInfo
   */
  public remoteRepoInfo(repo: GitRepo, user = "", password = "") {
    return remoteRepoInfo(this.h, repo, user, password)
  }

  public switchRepoBranch(
    repo: GitRepo,
    branch: string,
    create = false,
    user = "",
    password = ""
  ) {
    return switchRepoBranch(this.h, repo, branch, create, user, password)
  }

  public annotationDefinitions() {
    return annotationDefinitions(this.h)
  }

  public ddicElement(
    path: string | string[],
    getTargetForAssociation = false,
    getExtensionViews = true,
    getSecondaryObjects = true
  ) {
    return ddicElement(
      this.h,
      path,
      getTargetForAssociation,
      getExtensionViews,
      getSecondaryObjects
    )
  }

  public ddicRepositoryAccess(path: string | string[]) {
    return ddicRepositoryAccess(this.h, path)
  }
}
