import { guessEnv } from "./guessEnv.ts";
import { Attr } from "./lib/attributes.ts";
import { Falsy, isFalsy } from "./util.ts";
import { isState, SimpleStateRO } from "./state.ts";
import { Document, HTMLElement, Node, Text } from "./lib/dom.ts";
import { HyperHTMLStringNode, HyperNodeish } from "./node.ts";

declare const document: Document;

// deno-lint-ignore no-explicit-any
type AnyFunction = (...props: any[]) => void;

type AttributePrimitive = string | number | boolean | AnyFunction | Falsy;
type AttributeValue = AttributePrimitive | (string | Falsy)[] | Record<string, AttributePrimitive>;
type AttributeObject = Record<string, AttributeValue>;

type NodeToDOM<N extends HyperNodeish> = N extends Falsy ? null
	: N extends string ? Text
	: N extends SimpleStateRO<string> ? Text
	: HTMLElement;

function htmlStringToElement(html: string): Node | null {
	const template = document.createElement("template");
	template.innerHTML = html;
	return template.content.firstChild;
}

function attrifyDOM(el: HTMLElement, attrs: AttributeObject, prefix = "") {
	for (const attr in attrs) {
		const value = attrs[attr as keyof Attr];
		// if (value === "") el.setAttribute(prefix + attr, "");
		if (!value) return;
		else if (attr === "ref" && typeof value === "function") value(el);
		else if (Array.isArray(value)) el.setAttribute(attr, value.filter((x) => x).join(" "));
		else if (typeof value === "object") attrifyDOM(el, value, attr + "-");
		else if (typeof value === "boolean") {
			if (value) el.setAttribute(prefix + attr, "");
			// no-op
			else null;
		} else if (prefix === "on-" && typeof value === "function") el.addEventListener(attr, value);
		else if (value) el.setAttribute(prefix + attr, String(value));
	}
}

const toDOM = function toDOM<N extends HyperNodeish>(parent: HTMLElement, node: N): Node | null {
	if (typeof node === "string") return document.createTextNode(node);
	if (isFalsy(node)) return null;
	if (node instanceof HyperHTMLStringNode) return htmlStringToElement(node.htmlString);
	if (isState(node)) {
		let init = toDOM(parent, node.init);

		node.subscribe((val) => {
			const update = toDOM(parent, val);

			if (update === null || init === null) {
				// no-op
			} else {
				parent.replaceChild(update, init);
				// replace init for future updates
				init = update;
			}
		});

		// return DOMNode for rendering
		return init;
	}

	const el = document.createElement(node.tag);

	attrifyDOM(el, node.attrs);

	for (const child of node.children) {
		const childNode = toDOM(el, child);
		if (childNode === null) {
			//
		} else el.append(childNode);
	}

	return el;
} as <N extends HyperNodeish>(parent: HTMLElement, node: N) => NodeToDOM<N>;

class DOMNotFound extends Error {
	constructor(env?: string) {
		super(
			[
				`renderDOM is meant to be used in the browser.`,
				`Found: '${env || "unknown"}'.`,
				`To force, pass \`{ skipEnvCheck: true }\` to renderDOM.`,
			].join(" "),
		);
	}
}

function clear(node: HTMLElement) {
	let child;

	while ((child = node.firstChild)) {
		node.removeChild(child);
	}
}

type Opts = {
	skipEnvCheck?: boolean;
};

export function renderDOM<H extends HyperNodeish>(
	rootNode: HTMLElement,
	hyperNode: H,
	{ skipEnvCheck }: Opts = {},
) {
	if (!skipEnvCheck) {
		const env = guessEnv();
		if (env !== "browser") throw new DOMNotFound(env);
	}

	clear(rootNode);
	const el = toDOM(rootNode, hyperNode);
	if (el) rootNode.append(el);
}
