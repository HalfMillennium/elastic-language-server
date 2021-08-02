/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	CodeLensResolveRequest
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

import axios, {AxiosResponse} from 'axios';
import esb = require('elastic-builder');
import { start } from 'repl';
//import vscode from 'vscode';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

// BASE_FI_URL -> doesn't seem to work very well :(

const BASE_DB_URL = 'http://gew1-backstagesearch-a-62xc.gew1.spotify.net:9200/search-dataset/_search'
const BASE_FI_URL = 'http://gew1-backstagesearch-a-62xc.gew1.spotify.net:9200/search-schema-field/_search'
//const BASE_FI_URL = 'https://backstage.spotify.net/api/backstagesearch/search-schema-field/_search'
//const BASE_DB_URL = 'https://backstage-proxy.spotify.net/api/backstagesearch/search-dataset/_search'
let global_text: TextDocument;

connection.onInitialize((params: InitializeParams) => {
	const capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
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

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

// The example settings
interface ExampleSettings {
	maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = <ExampleSettings>(
			(change.settings.elasticLanguageServer || defaultSettings)
		);
	}

	// Revalidate all open text documents
	documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
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
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
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

function getLastWord(doc: TextDocument) {
	const pattern = /\b[A-Z]{2,}\b/g;
	let m: RegExpExecArray | null;
}

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
	// In this simple example we get the settings for every validate run.
	const settings = await getDocumentSettings(textDocument.uri);

	// The validator creates diagnostics for all uppercase words length 2 and more
	const text = textDocument.getText();
	global_text = textDocument;
	const pattern = /\b[A-Z]{2,}\b/g;
	let m: RegExpExecArray | null;

	let problems = 0;
	const diagnostics: Diagnostic[] = [];
	while ((m = pattern.exec(text)) && problems < settings.maxNumberOfProblems) {
		problems++;
		const diagnostic: Diagnostic = {
			severity: DiagnosticSeverity.Warning,
			range: {
				start: textDocument.positionAt(m.index),
				end: textDocument.positionAt(m.index + m[0].length)
			},
			message: `${m[0]} is all uppercase.`,
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
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received a file change event');
});

const queryEndpointSearch = async (
	searchTerm: string = '',
	tablePage: number = 0,
	tableSort: any = ['_score'],
  ) => {
	searchTerm = searchTerm.trim()
	const requestBody = esb
	  .requestBodySearch()
	  .sort(esb.sort(tableSort?.[0]))
	  .from(tablePage)
	  .size(10)
	  //.aggregations(Object.values(ENDPOINT_FILTER_ES_FIELD).map(id => esb.termsAggregation(id, id)))
	  .query(
		esb
		  .functionScoreQuery()
		  .query(
			esb
			  .boolQuery()
			  .must(esb.termQuery('storageType.keyword', 'BIGQUERY'))
			  .must([
				...(searchTerm.length
				  ? [esb.multiMatchQuery(['id.ngram_raw^2', 'id.dataset^3', 'uriTemplate^3'], searchTerm)]
				  : []),
				esb.existsQuery('storageType'),
			  ])
			  .should([
				esb.matchQuery('lifecycle', 'production').boost(3),
				esb.matchQuery('tc4dLevel', '3').boost(4),
				esb.matchQuery('tc4dLevel', '2').boost(3),
				esb.matchQuery('tc4dLevel', '1').boost(2),
				esb.termQuery('isGolden', true).boost(1),
				...(searchTerm.length ? [esb.matchQuery('resourceId', searchTerm).boost(1)] : []),
			  ]),
		  )
		  .function(
			esb
			  .fieldValueFactorFunction('numUsers')
			  .modifier('ln1p')
			  .missing(1),
		  )
		  .boostMode('sum')
	  );
	const result = await axios.post(BASE_DB_URL, requestBody.toJSON());
	return result;
	//return queryElasticsearch('search-dataset/_search', requestBody.toJSON());
  };

const queryFieldSearch = async (searchTerm: string = '') => {
	searchTerm = searchTerm.trim()
	console.log("searchTerm:", searchTerm)
	const requestBody = esb
	  .requestBodySearch()
	  .size(50)
	  .query(
		esb.boolQuery().should([
		  // Try to match both the field's full name and any description text
		  ...(searchTerm.length
			? [
				esb
				  .multiMatchQuery(
					[
					  // field_path tokenizes underscores
					  'name.field_path^3',
					  'name.ngram_raw^2',
					  'fieldDescription^1'
					],
					searchTerm,
				  )
				  .type('best_fields'),
				// Exact name matches should win over everything else
				esb.termQuery('name.keyword', searchTerm).boost(2),
			  ]
			: []),
		]),
	  )
	  .aggregation(
		esb
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
		  ]),
	  );
	
	const result = await axios.post(BASE_FI_URL, requestBody.toJSON());
	return result
	//return queryElasticsearch('search-schema-field/_search', requestBody.toJSON());
  };

// In charge of parsing endpoint query responses
function parseEndQ(res: any, val: number) {
	return res.data.hits.hits[val]._id
}

// In charge of parsing schema field query reponses
function parseSchemQ(res: any, val: number) {
	return res.data.hits.hits[val]._source.name
}

// This handler provides the initial list of the completion items.
connection.onCompletion(
	async (_textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> => {
		// The pass parameter contains the position of the text document in
		// which code complete got requested. For the example we ignore this
		// info and always provide the same completion items.

		// Set defaults for base_url and query_strat
		let base_url = BASE_FI_URL
		let query_strat = queryFieldSearch
		let parse_method = parseSchemQ
		// CompletionItemKind.Module
		let _kind = 8
		// Cast to string with '' (instead of 'string or undefined')
		//let full_doc = documents?.get(_textDocumentPosition.textDocument.uri)
		let value = ''+documents?.get(_textDocumentPosition.textDocument.uri)?.getText()
		
		let pattern = /\b(\w+)\W*$/g;
  		//let pattern = /\b[a-z]{2,}\b/g;
		let m: RegExpExecArray | null;
		
		//console.log("Pattern match:",pattern.exec(''+full_doc?.getText()))
		// Only searches for the text after the most recent space
		let space_index = value.lastIndexOf(" ")
		let last_word = value.substring(space_index, value.length)
		if(last_word.includes("\`")) {
			last_word = last_word.substring(last_word.lastIndexOf("\`")+1)
			base_url = BASE_DB_URL
			query_strat = queryEndpointSearch
			parse_method = parseEndQ
			// CompletionItemKind.Module
			_kind = 3
		}

		let response: any = []
		let set: any = new Set()
		let names: any = []
		console.log("Queried word: " + last_word)

		try {
			response = await query_strat(last_word)
		} catch (exception) {
			process.stderr.write(`ERROR received: ${exception}\n`);
		}
		console.log('Raw [field search] response: ',response)
		for(var val in response.data.hits.hits) {
			let current = parse_method(response, Number.parseInt(val))
			if(!set.has(current)) {
				names.push(
					{
						label: current,
						kind: _kind,
						data: base_url
					}
				)
				set.add(current)
			}
		}

		console.log(names)
		return names;
	}
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		if (item.data === BASE_DB_URL) {
			item.detail = 'Endpoint suggestion';
			item.documentation = 'Base url: ' + BASE_DB_URL;
		} else {
			item.detail = 'Schema field suggestion';
			item.documentation = 'Base url: ' + BASE_FI_URL;
		}
		return item;
	}
);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
