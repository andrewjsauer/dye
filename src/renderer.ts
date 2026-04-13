import renderNodeToOutput, {
	renderNodeToScreenReaderOutput,
} from './render-node-to-output.js';
import Output from './output.js';
import {type DOMElement} from './dom.js';
import {type Screen} from './screen.js';
import {type StylePool} from './pools.js';
import {clearNodeCache} from './node-cache.js';

type Result = {
	output: string;
	outputHeight: number;
	staticOutput: string;
	/** The Screen buffer for cell-level diffing (undefined for screen reader mode). */
	screen?: Screen;
	/** The StylePool used to intern styleIds in the Screen. Required by diffScreens. */
	stylePool?: StylePool;
};

const renderer = (node: DOMElement, isScreenReaderEnabled: boolean): Result => {
	if (node.yogaNode) {
		if (isScreenReaderEnabled) {
			const output = renderNodeToScreenReaderOutput(node, {
				skipStaticElements: true,
			});

			const outputHeight = output === '' ? 0 : output.split('\n').length;

			let staticOutput = '';

			if (node.staticNode) {
				staticOutput = renderNodeToScreenReaderOutput(node.staticNode, {
					skipStaticElements: false,
				});
			}

			return {
				output,
				outputHeight,
				staticOutput: staticOutput ? `${staticOutput}\n` : '',
			};
		}

		// Clear node rect cache at the start of each render cycle
		clearNodeCache();

		const output = new Output({
			width: node.yogaNode.getComputedWidth(),
			height: node.yogaNode.getComputedHeight(),
		});

		renderNodeToOutput(node, output, {
			skipStaticElements: true,
		});

		let staticOutput;

		if (node.staticNode?.yogaNode) {
			staticOutput = new Output({
				width: node.staticNode.yogaNode.getComputedWidth(),
				height: node.staticNode.yogaNode.getComputedHeight(),
			});

			renderNodeToOutput(node.staticNode, staticOutput, {
				skipStaticElements: false,
			});
		}

		const {output: generatedOutput, height: outputHeight, screen} = output.get();

		return {
			output: generatedOutput,
			outputHeight,
			// Newline at the end is needed, because static output doesn't have one, so
			// interactive output will override last line of static output
			staticOutput: staticOutput ? `${staticOutput.get().output}\n` : '',
			screen,
			stylePool: output.stylePool,
		};
	}

	return {
		output: '',
		outputHeight: 0,
		staticOutput: '',
	};
};

export default renderer;
