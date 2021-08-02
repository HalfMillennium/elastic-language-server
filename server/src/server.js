"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from) {
    for (var i = 0, il = from.length, j = to.length; i < il; i++, j++)
        to[j] = from[i];
    return to;
};
exports.__esModule = true;
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
var node_1 = require("vscode-languageserver/node");
var vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
var axios_1 = require("axios");
var esb = require("elastic-builder");
//import vscode from 'vscode';
// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
var connection = node_1.createConnection(node_1.ProposedFeatures.all);
// Create a simple text document manager.
var documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
var hasConfigurationCapability = false;
var hasWorkspaceFolderCapability = false;
var hasDiagnosticRelatedInformationCapability = false;
// BASE_FI_URL -> doesn't seem to work very well :(
var BASE_DB_URL = 'http://gew1-backstagesearch-a-62xc.gew1.spotify.net:9200/search-dataset/_search';
var BASE_FI_URL = 'http://gew1-backstagesearch-a-62xc.gew1.spotify.net:9200/search-schema-field/_search';
//const BASE_FI_URL = 'https://backstage.spotify.net/api/backstagesearch/search-schema-field/_search'
//const BASE_DB_URL = 'https://backstage-proxy.spotify.net/api/backstagesearch/search-dataset/_search'
var global_text;
connection.onInitialize(function (params) {
    var capabilities = params.capabilities;
    // Does the client support the `workspace/configuration` request?
    // If not, we fall back using global settings.
    hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
    hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);
    hasDiagnosticRelatedInformationCapability = !!(capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation);
    var result = {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
            // Tell the client that this server supports code completion.
            completionProvider: {
                resolveProvider: true
            }
        }
    };
    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true
            }
        };
    }
    return result;
});
connection.onInitialized(function () {
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(node_1.DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(function (_event) {
            connection.console.log('Workspace folder change event received.');
        });
    }
});
// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
var defaultSettings = { maxNumberOfProblems: 1000 };
var globalSettings = defaultSettings;
// Cache the settings of all open documents
var documentSettings = new Map();
connection.onDidChangeConfiguration(function (change) {
    if (hasConfigurationCapability) {
        // Reset all cached document settings
        documentSettings.clear();
    }
    else {
        globalSettings = ((change.settings.elasticLanguageServer || defaultSettings));
    }
    // Revalidate all open text documents
    documents.all().forEach(validateTextDocument);
});
function getDocumentSettings(resource) {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    var result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'elasticLanguageServer'
        });
        documentSettings.set(resource, result);
    }
    return result;
}
// Only keep settings for open documents
documents.onDidClose(function (e) {
    documentSettings["delete"](e.document.uri);
});
// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(function (change) {
    validateTextDocument(change.document);
    /*const editor = vscode.window.activeTextEditor;
    const document = editor?.document
    const cursorPos = editor?.selection.active
    if(document && cursorPos) {
        let current_line = document.lineAt(cursorPos).text
        console.log("Last word on line:",current_line.substring(current_line.lastIndexOf(' ')+1))
    }*/
    //getLastWord(change.document);
});
function getLastWord(doc) {
    var pattern = /\b[A-Z]{2,}\b/g;
    var m;
}
function validateTextDocument(textDocument) {
    return __awaiter(this, void 0, void 0, function () {
        var settings, text, pattern, m, problems, diagnostics, diagnostic;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDocumentSettings(textDocument.uri)];
                case 1:
                    settings = _a.sent();
                    text = textDocument.getText();
                    global_text = textDocument;
                    pattern = /\b[A-Z]{2,}\b/g;
                    problems = 0;
                    diagnostics = [];
                    while ((m = pattern.exec(text)) && problems < settings.maxNumberOfProblems) {
                        problems++;
                        diagnostic = {
                            severity: node_1.DiagnosticSeverity.Warning,
                            range: {
                                start: textDocument.positionAt(m.index),
                                end: textDocument.positionAt(m.index + m[0].length)
                            },
                            message: m[0] + " is all uppercase.",
                            source: 'ex'
                        };
                        if (hasDiagnosticRelatedInformationCapability) {
                            diagnostic.relatedInformation = [
                                {
                                    location: {
                                        uri: textDocument.uri,
                                        range: Object.assign({}, diagnostic.range)
                                    },
                                    message: 'Spelling matters'
                                },
                                {
                                    location: {
                                        uri: textDocument.uri,
                                        range: Object.assign({}, diagnostic.range)
                                    },
                                    message: 'Particularly for names'
                                }
                            ];
                        }
                        diagnostics.push(diagnostic);
                    }
                    // Send the computed diagnostics to VSCode.
                    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: diagnostics });
                    return [2 /*return*/];
            }
        });
    });
}
connection.onDidChangeWatchedFiles(function (_change) {
    // Monitored files have change in VSCode
    connection.console.log('We received a file change event');
});
var queryEndpointSearch = function (searchTerm, tablePage, tableSort) {
    if (searchTerm === void 0) { searchTerm = ''; }
    if (tablePage === void 0) { tablePage = 0; }
    if (tableSort === void 0) { tableSort = ['_score']; }
    return __awaiter(void 0, void 0, void 0, function () {
        var requestBody, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    searchTerm = searchTerm.trim();
                    requestBody = esb
                        .requestBodySearch()
                        .sort(esb.sort(tableSort === null || tableSort === void 0 ? void 0 : tableSort[0]))
                        .from(tablePage)
                        .size(10)
                        //.aggregations(Object.values(ENDPOINT_FILTER_ES_FIELD).map(id => esb.termsAggregation(id, id)))
                        .query(esb
                        .functionScoreQuery()
                        .query(esb
                        .boolQuery()
                        .must(esb.termQuery('storageType.keyword', 'BIGQUERY'))
                        .must(__spreadArray(__spreadArray([], (searchTerm.length
                        ? [esb.multiMatchQuery(['id.ngram_raw^2', 'id.dataset^3', 'uriTemplate^3'], searchTerm)]
                        : [])), [
                        esb.existsQuery('storageType'),
                    ]))
                        .should(__spreadArray([
                        esb.matchQuery('lifecycle', 'production').boost(3),
                        esb.matchQuery('tc4dLevel', '3').boost(4),
                        esb.matchQuery('tc4dLevel', '2').boost(3),
                        esb.matchQuery('tc4dLevel', '1').boost(2),
                        esb.termQuery('isGolden', true).boost(1)
                    ], (searchTerm.length ? [esb.matchQuery('resourceId', searchTerm).boost(1)] : []))))["function"](esb
                        .fieldValueFactorFunction('numUsers')
                        .modifier('ln1p')
                        .missing(1))
                        .boostMode('sum'));
                    return [4 /*yield*/, axios_1["default"].post(BASE_DB_URL, requestBody.toJSON())];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, result];
            }
        });
    });
};
var queryFieldSearch = function (searchTerm) {
    if (searchTerm === void 0) { searchTerm = ''; }
    return __awaiter(void 0, void 0, void 0, function () {
        var requestBody, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    searchTerm = searchTerm.trim();
                    console.log("searchTerm:", searchTerm);
                    requestBody = esb
                        .requestBodySearch()
                        .size(50)
                        .query(esb.boolQuery().should(__spreadArray([], (searchTerm.length
                        ? [
                            esb
                                .multiMatchQuery([
                                // field_path tokenizes underscores
                                'name.field_path^3',
                                'name.ngram_raw^2',
                                'fieldDescription^1'
                            ], searchTerm)
                                .type('best_fields'),
                            // Exact name matches should win over everything else
                            esb.termQuery('name.keyword', searchTerm).boost(2),
                        ]
                        : []))))
                        .aggregation(esb
                        .termsAggregation('fieldDigest')
                        .field('fieldDigestId')
                        .size(300)
                        .order('sum_score', 'desc')
                        .aggregations([
                        esb.termsAggregation('fieldType').field('fieldType'),
                        esb.sumAggregation('nQueries').field('nQueries'),
                        esb.sumAggregation('nUsers').field('nUsers'),
                        // order scores by maximum
                        esb.maxAggregation('sum_score').script(esb.script('inline', '_score')),
                    ]));
                    return [4 /*yield*/, axios_1["default"].post(BASE_FI_URL, requestBody.toJSON())];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, result
                        //return queryElasticsearch('search-schema-field/_search', requestBody.toJSON());
                    ];
            }
        });
    });
};
// In charge of parsing endpoint query responses
function parseEndQ(res, val) {
    return res.data.hits.hits[val]._id;
}
// In charge of parsing schema field query reponses
function parseSchemQ(res, val) {
    return res.data.hits.hits[val]._source.name;
}
// This handler provides the initial list of the completion items.
connection.onCompletion(function (_textDocumentPosition) { return __awaiter(void 0, void 0, void 0, function () {
    var base_url, query_strat, parse_method, _kind, value, pattern, m, space_index, last_word, response, set, names, exception_1, val, current;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                base_url = BASE_FI_URL;
                query_strat = queryFieldSearch;
                parse_method = parseSchemQ;
                _kind = 8;
                value = '' + ((_a = documents === null || documents === void 0 ? void 0 : documents.get(_textDocumentPosition.textDocument.uri)) === null || _a === void 0 ? void 0 : _a.getText());
                pattern = /\b(\w+)\W*$/g;
                space_index = value.lastIndexOf(" ");
                last_word = value.substring(space_index, value.length);
                if (last_word.includes("\`")) {
                    last_word = last_word.substring(last_word.lastIndexOf("\`") + 1);
                    base_url = BASE_DB_URL;
                    query_strat = queryEndpointSearch;
                    parse_method = parseEndQ;
                    // CompletionItemKind.Module
                    _kind = 3;
                }
                response = [];
                set = new Set();
                names = [];
                console.log("Queried word: " + last_word);
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, query_strat(last_word)];
            case 2:
                response = _b.sent();
                return [3 /*break*/, 4];
            case 3:
                exception_1 = _b.sent();
                process.stderr.write("ERROR received: " + exception_1 + "\n");
                return [3 /*break*/, 4];
            case 4:
                console.log('Raw [field search] response: ', response);
                for (val in response.data.hits.hits) {
                    current = parse_method(response, Number.parseInt(val));
                    if (!set.has(current)) {
                        names.push({
                            label: current,
                            kind: _kind,
                            data: base_url
                        });
                        set.add(current);
                    }
                }
                console.log(names);
                return [2 /*return*/, names];
        }
    });
}); });
// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(function (item) {
    if (item.data === BASE_DB_URL) {
        item.detail = 'Endpoint suggestion';
        item.documentation = 'Base url: ' + BASE_DB_URL;
    }
    else {
        item.detail = 'Schema field suggestion';
        item.documentation = 'Base url: ' + BASE_FI_URL;
    }
    return item;
});
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);
// Listen on the connection
connection.listen();
