/**
 * @license Copyright (c) 2003-2019, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

import ClassicTestEditor from '@ckeditor/ckeditor5-core/tests/_utils/classictesteditor';
import ContextualBalloon from '../../../src/panel/balloon/contextualballoon';
import BalloonPanelView from '../../../src/panel/balloon/balloonpanelview';
import View from '../../../src/view';
import CKEditorError from '@ckeditor/ckeditor5-utils/src/ckeditorerror';
import Plugin from '@ckeditor/ckeditor5-core/src/plugin';
import Paragraph from '@ckeditor/ckeditor5-paragraph/src/paragraph';
import { setData as setModelData } from '@ckeditor/ckeditor5-engine/src/dev-utils/model';

/* global document, Event */

describe( 'ContextualBalloon', () => {
	let editor, editorElement, balloon, viewA, viewB, viewC;

	beforeEach( () => {
		editorElement = document.createElement( 'div' );
		document.body.appendChild( editorElement );

		return ClassicTestEditor
			.create( editorElement, {
				plugins: [ Paragraph, ContextualBalloon ]
			} )
			.then( newEditor => {
				editor = newEditor;
				balloon = editor.plugins.get( ContextualBalloon );

				// We don't need to execute BalloonPanel pin and attachTo methods
				// it's enough to check if was called with the proper data.
				sinon.stub( balloon.view, 'attachTo' ).returns( {} );
				sinon.stub( balloon.view, 'pin' ).returns( {} );

				viewA = new View();
				viewB = new View();
				viewC = new View();

				// Add viewA to the pane and init viewB.
				balloon.add( {
					view: viewA,
					position: {
						target: 'fake'
					}
				} );

				viewB.render();
			} );
	} );

	afterEach( () => {
		editor.destroy();
		editorElement.remove();
	} );

	it( 'should create a plugin instance', () => {
		expect( balloon ).to.instanceof( Plugin );
		expect( balloon ).to.instanceof( ContextualBalloon );
	} );

	describe( 'pluginName', () => {
		it( 'should return plugin by name', () => {
			expect( editor.plugins.get( 'ContextualBalloon' ) ).to.equal( balloon );
		} );
	} );

	describe( 'constructor()', () => {
		it( 'should create a plugin instance with properties', () => {
			expect( balloon.view ).to.instanceof( BalloonPanelView );
		} );

		describe( 'positionLimiter', () => {
			let model, view, viewDocument, root;

			beforeEach( () => {
				model = editor.model;
				view = editor.editing.view;
				viewDocument = view.document;
				root = viewDocument.getRoot();
			} );

			it( 'obtains the root of the selection', () => {
				setModelData( model, '<paragraph>[]bar</paragraph>' );

				expect( balloon.positionLimiter() ).to.equal( view.domConverter.mapViewToDom( root ) );
			} );

			it( 'does not fail if selection has no #editableElement', () => {
				sinon.stub( viewDocument.selection, 'editableElement' ).value( null );

				expect( balloon.positionLimiter() ).to.equal( null );
			} );

			it( 'obtains the farthest root of the selection (nested editable)', () => {
				model.schema.register( 'widget', {
					allowIn: '$root',
					isObject: true
				} );
				model.schema.register( 'nestedEditable', { allowIn: 'widget' } );
				model.schema.extend( '$text', { allowIn: 'nestedEditable' } );

				editor.conversion.for( 'downcast' ).elementToElement( {
					model: 'widget',
					view: ( modelElement, viewWriter ) => viewWriter.createContainerElement( 'figure', { contenteditable: 'false' } )
				} );

				editor.conversion.for( 'downcast' ).elementToElement( {
					model: 'nestedEditable',
					view: ( modelElement, viewWriter ) => viewWriter.createContainerElement( 'figcaption', { contenteditable: 'true' } )
				} );

				setModelData( model, '<widget><nestedEditable>[]foo</nestedEditable></widget>' );

				expect( balloon.positionLimiter() ).to.equal( view.domConverter.mapViewToDom( root ) );
			} );
		} );

		it( 'should add balloon panel view to editor `body` collection', () => {
			expect( editor.ui.view.body.getIndex( balloon.view ) ).to.above( -1 );
		} );

		it( 'should register balloon panel element in editor.ui#focusTracker', () => {
			editor.ui.focusTracker.isFocused = false;

			balloon.add( {
				view: viewB,
				position: {
					target: 'fake',
					limiter: balloon.positionLimiter
				}
			} );

			balloon.view.element.dispatchEvent( new Event( 'focus' ) );

			expect( editor.ui.focusTracker.isFocused ).to.true;
		} );
	} );

	describe( 'hasView()', () => {
		it( 'should return true when given view is in stack', () => {
			expect( balloon.hasView( viewA ) ).to.true;
		} );

		it( 'should return true when given view is in stack but is not visible', () => {
			balloon.add( {
				view: viewB,
				position: {
					target: 'fake',
					limiter: balloon.positionLimiter
				}
			} );

			expect( balloon.visibleView ).to.equal( viewB );
			expect( balloon.hasView( viewA ) ).to.true;
		} );

		it( 'should return false when given view is not in stack', () => {
			expect( balloon.hasView( viewB ) ).to.false;
		} );
	} );

	describe( 'add()', () => {
		it( 'should add view to the `main` stack and display in balloon attached using given position options', () => {
			const content = balloon.view.content.get( 0 ).content;

			expect( content.length ).to.equal( 1 );
			expect( content.get( 0 ) ).to.deep.equal( viewA );
			expect( balloon.view.pin.calledOnce ).to.true;
			sinon.assert.calledWithMatch( balloon.view.pin.firstCall, {
				target: 'fake',
				limiter: balloon.positionLimiter
			} );
		} );

		it( 'should add view to the custom stack but not display it when other panel is already visible', () => {
			balloon.add( {
				view: viewB,
				panelId: 'second',
				position: {
					target: 'fake'
				}
			} );

			balloon.add( {
				view: viewC,
				panelId: 'second',
				position: {
					target: 'fake'
				}
			} );

			const content = balloon.view.content.get( 0 ).content;

			expect( content.length ).to.equal( 1 );
			expect( content.get( 0 ) ).to.deep.equal( viewA );
			expect( balloon.hasView( viewB ) );
			expect( balloon.hasView( viewC ) );
		} );

		it( 'should add multiple views to he stack and display last one', () => {
			balloon.add( {
				view: viewB,
				position: {
					target: 'fake',
					limiter: balloon.positionLimiter
				}
			} );

			const content = balloon.view.content.get( 0 ).content;

			expect( content.length ).to.equal( 1 );
			expect( content.get( 0 ) ).to.deep.equal( viewB );
		} );

		it( 'should throw an error when try to add the same view more than once', () => {
			expect( () => {
				balloon.add( {
					view: viewA,
					position: {
						target: 'fake',
						limiter: balloon.positionLimiter
					}
				} );
			} ).to.throw( CKEditorError, /^contextualballoon-add-view-exist/ );
		} );

		it( 'should use a provided limiter instead of #positionLimiter', () => {
			balloon.remove( viewA );
			balloon.view.pin.resetHistory();

			balloon.add( {
				view: viewB,
				position: {
					target: 'foo',
					limiter: 'customLimiter'
				}
			} );

			sinon.assert.calledWithMatch( balloon.view.pin, {
				target: 'foo',
				limiter: 'customLimiter'
			} );
		} );

		it( 'should use a custom #positionLimiter', () => {
			balloon.remove( viewA );
			balloon.view.pin.resetHistory();
			balloon.positionLimiter = 'customLimiter';

			balloon.add( {
				view: viewB,
				position: {
					target: 'foo',
				}
			} );

			sinon.assert.calledWithMatch( balloon.view.pin, {
				target: 'foo',
				limiter: 'customLimiter'
			} );
		} );

		it( 'should not alter the view data if no limiter is provided and the #positionLimiter is used', () => {
			const data = {
				view: viewB,
				position: {
					target: 'foo',
				}
			};

			balloon.remove( viewA );
			balloon.add( data );

			expect( data ).to.deep.equal( {
				view: viewB,
				position: {
					target: 'foo'
				}
			} );
		} );

		it( 'should pin balloon to the target element', () => {
			sinon.assert.calledOnce( balloon.view.pin );
		} );

		it( 'should use the position of the last view in the stack', () => {
			balloon.add( {
				view: viewB,
				position: { target: 'other' }
			} );

			expect( balloon.view.pin.calledTwice ).to.true;

			sinon.assert.calledWithMatch( balloon.view.pin.firstCall, {
				target: 'fake',
				limiter: balloon.positionLimiter
			} );

			sinon.assert.calledWithMatch( balloon.view.pin.secondCall, {
				target: 'other',
				limiter: balloon.positionLimiter
			} );
		} );

		it( 'should set additional css class of visible view to BalloonPanelView', () => {
			const view = new View();

			balloon.add( {
				view,
				position: {
					target: 'fake',
					limiter: balloon.positionLimiter
				},
				balloonClassName: 'foo'
			} );

			expect( balloon.view.class ).to.equal( 'foo' );

			balloon.add( {
				view: viewB,
				position: {
					target: 'fake',
					limiter: balloon.positionLimiter
				},
				balloonClassName: 'bar'
			} );

			expect( balloon.view.class ).to.equal( 'bar' );
		} );

		it( 'should hide arrow if `withArrow` option is set to false', () => {
			balloon.remove( viewA );
			balloon.view.pin.resetHistory();

			balloon.add( {
				view: viewB,
				position: {
					target: 'foo'
				},
				withArrow: false
			} );

			expect( balloon.view.withArrow ).to.be.false;
		} );

		it( 'should show arrow if `withArrow` option was not set and previously shown view had hidden arrow', () => {
			balloon.remove( viewA );
			balloon.view.pin.resetHistory();

			balloon.add( {
				view: viewB,
				position: {
					target: 'foo'
				},
				withArrow: false
			} );

			expect( balloon.view.withArrow ).to.be.false;

			balloon.remove( viewB );

			balloon.add( {
				view: viewB,
				position: {
					target: 'foo'
				}
			} );

			expect( balloon.view.withArrow ).to.be.true;
		} );
	} );

	describe( 'visibleView', () => {
		it( 'should return data of currently visible view', () => {
			expect( balloon.visibleView ).to.equal( viewA );
		} );

		it( 'should return data of currently visible view when there is more than one in the stack', () => {
			balloon.add( {
				view: viewB,
				position: {
					target: 'fake',
					limiter: balloon.positionLimiter
				}
			} );

			expect( balloon.visibleView ).to.equal( viewB );
		} );

		it( 'should return `null` when the stack is empty', () => {
			balloon.remove( viewA );
			expect( balloon.visibleView ).to.null;
		} );
	} );

	describe( 'showPanel()', () => {
		it( 'should hide current view and display last view from the given panel stack', () => {
			balloon.add( {
				panelId: 'second',
				view: viewB
			} );

			balloon.add( {
				panelId: 'second',
				view: viewC
			} );

			expect( balloon.visibleView ).to.equal( viewA );

			balloon.showPanel( 'second' );

			expect( balloon.visibleView ).to.equal( viewC );

			balloon.showPanel( 'main' );

			expect( balloon.visibleView ).to.equal( viewA );
		} );

		it( 'should do nothing when given panel is already visible', () => {
			expect( () => {
				balloon.showPanel( 'main' );
			} ).to.not.throw();
		} );

		it( 'should throw an error when there is no panel of given id', () => {
			expect( () => {
				balloon.showPanel( 'second' );
			} ).to.throw( CKEditorError, 'contextualballoon-showpanel-panel-not-exist: Cannot show not existing panel.' );
		} );
	} );

	describe( 'remove()', () => {
		it( 'should remove given view and hide balloon when there is no other view to display', () => {
			balloon.view.isVisible = true;

			balloon.remove( viewA );

			expect( balloon.visibleView ).to.null;
			expect( balloon.view.isVisible ).to.false;
		} );

		it( 'should remove given view from not displayed panel', () => {
			balloon.add( {
				panelId: 'second',
				view: viewB
			} );

			balloon.add( {
				panelId: 'second',
				view: viewC
			} );

			balloon.remove( viewB );

			expect( balloon.visibleView ).to.equal( viewA );
			expect( () => {
				balloon.showPanel( 'second' );
			} ).to.not.throw();
		} );

		it( 'should remove not displayed panel if a removed view was the only view in this panel', () => {
			balloon.add( {
				panelId: 'second',
				view: viewB
			} );

			balloon.remove( viewB );

			expect( balloon.visibleView ).to.equal( viewA );
			expect( () => {
				balloon.showPanel( 'second' );
			} ).to.throw();
		} );

		it( 'should switch panel to the next one when removed view was the last one in the visible panel', () => {
			balloon.add( {
				panelId: 'second',
				view: viewB
			} );

			balloon.remove( viewA );

			expect( balloon.visibleView ).to.equal( viewB );
			expect( () => {
				balloon.showPanel( 'main' );
			} ).to.throw();
		} );

		it( 'should remove given view and set preceding in the stack as visible when removed view was visible', () => {
			balloon.add( {
				view: viewB,
				position: {
					target: 'fake',
					limiter: balloon.positionLimiter
				}
			} );

			balloon.remove( viewB );

			expect( balloon.visibleView ).to.equal( viewA );
		} );

		it( 'should remove given view from the stack when view is not visible', () => {
			balloon.add( {
				view: viewB,
				position: {
					target: 'fake',
					limiter: balloon.positionLimiter
				}
			} );

			balloon.remove( viewA );

			expect( balloon.visibleView ).to.equal( viewB );
		} );

		it( 'should remove given view from a not currently visible stack', () => {
			balloon.add( {
				view: viewB,
				panelId: 'second',
				position: {
					target: 'fake'
				}
			} );

			balloon.add( {
				view: viewC,
				panelId: 'second',
				position: {
					target: 'fake'
				}
			} );

			balloon.remove( viewB );

			expect( balloon.hasView( viewB ) ).to.false;
			expect( balloon.hasView( viewC ) ).to.true;

			// Does not throw, so the panel is there.
			expect( () => {
				balloon.showPanel( 'second' );
			} ).to.not.throw();
		} );

		it( 'should remove not displayed stack when removied view was the last one in the stack', () => {
			balloon.add( {
				view: viewB,
				panelId: 'second',
				position: {
					target: 'fake'
				}
			} );

			balloon.remove( viewB );

			expect( balloon.hasView( viewB ) ).to.false;

			// Does throw, so the panel is not there.
			expect( () => {
				balloon.showPanel( 'second' );
			} ).to.throw();
		} );

		it( 'should throw an error when there is no given view in the stack', () => {
			expect( () => {
				balloon.remove( viewB );
			} ).to.throw( CKEditorError, /^contextualballoon-remove-view-not-exist/ );
		} );

		it( 'should set additional css class of visible view to BalloonPanelView', () => {
			const view = new View();

			balloon.add( {
				view,
				position: {
					target: 'fake',
					limiter: balloon.positionLimiter
				},
				balloonClassName: 'foo'
			} );

			balloon.add( {
				view: viewB,
				position: {
					target: 'fake',
					limiter: balloon.positionLimiter
				},
				balloonClassName: 'bar'
			} );

			balloon.remove( viewB );

			expect( balloon.view.class ).to.equal( 'foo' );
		} );
	} );

	describe( 'updatePosition()', () => {
		it( 'should attach balloon to the target using position option from the last view in the stack', () => {
			balloon.add( {
				view: viewB,
				position: {
					target: 'other'
				}
			} );

			balloon.view.pin.resetHistory();

			balloon.updatePosition();

			expect( balloon.view.pin.calledOnce );
			sinon.assert.calledWithMatch( balloon.view.pin.firstCall, {
				target: 'other',
				limiter: balloon.positionLimiter
			} );
		} );

		it( 'should set given position to the currently visible view and use position from the first view in the stack #1', () => {
			balloon.view.pin.resetHistory();

			balloon.updatePosition( { target: 'new' } );

			expect( balloon.view.pin.calledOnce );
			sinon.assert.calledWithMatch( balloon.view.pin.firstCall, {
				target: 'new',
				limiter: balloon.positionLimiter
			} );
		} );

		it( 'should set given position to the currently visible view and use position from the first view in the stack #2', () => {
			balloon.add( {
				view: viewB,
				position: {
					target: 'other'
				}
			} );

			balloon.view.pin.resetHistory();

			balloon.updatePosition( { target: 'new' } );

			expect( balloon.view.pin.calledOnce );
			sinon.assert.calledWithMatch( balloon.view.pin.firstCall, {
				target: 'new',
				limiter: balloon.positionLimiter
			} );

			balloon.remove( viewA );

			balloon.updatePosition();

			expect( balloon.view.pin.calledTwice );
			sinon.assert.calledWithMatch( balloon.view.pin.secondCall, {
				target: 'new',
				limiter: balloon.positionLimiter
			} );
		} );

		it( 'should use a given position limiter instead of the default one', () => {
			balloon.view.pin.resetHistory();

			balloon.updatePosition( {
				target: 'new',
				limiter: 'customLimiter'
			} );

			expect( balloon.view.pin.calledOnce );
			sinon.assert.calledWithMatch( balloon.view.pin.firstCall, {
				target: 'new',
				limiter: 'customLimiter'
			} );
		} );

		it( 'should throw an error when there is no given view in the stack', () => {
			expect( () => {
				balloon.remove( viewB );
			} ).to.throw( CKEditorError, /^contextualballoon-remove-view-not-exist/ );
		} );
	} );

	describe( 'destroy()', () => {
		it( 'can be called multiple times', () => {
			expect( () => {
				balloon.destroy();
				balloon.destroy();
			} ).to.not.throw();
		} );

		it( 'should not touch the DOM', () => {
			balloon.destroy();

			expect( editor.ui.view.body.getIndex( balloon.view ) ).to.not.equal( -1 );
		} );
	} );

	describe( 'rotator view', () => {
		let rotatorView;

		beforeEach( () => {
			rotatorView = balloon.view.content.get( 0 );
		} );

		it( 'should display navigation when there is more than one panel', () => {
			const navigationElement = rotatorView.element.querySelector( '.ck-balloon-rotator__navigation' );

			expect( navigationElement.classList.contains( 'ck-hidden' ) ).to.equal( true );

			balloon.add( {
				view: viewB,
				panelId: 'second'
			} );

			expect( navigationElement.classList.contains( 'ck-hidden' ) ).to.equal( false );
		} );

		it( 'should display counter', () => {
			const counterElement = rotatorView.element.querySelector( '.ck-balloon-rotator__counter' );

			expect( counterElement.textContent ).to.equal( '1 of 1' );

			balloon.add( {
				view: viewB,
				panelId: 'second'
			} );

			expect( counterElement.textContent ).to.equal( '1 of 2' );

			balloon.showPanel( 'second' );

			expect( counterElement.textContent ).to.equal( '2 of 2' );
		} );

		it( 'should hide counter when element width is less then 200px', () => {
			// To be sure navigation is displayed.
			balloon.add( {
				view: viewB,
				panelId: 'second'
			} );

			const counterElement = rotatorView.element.querySelector( '.ck-balloon-rotator__counter' );
			let mockedWidth = 201;

			sinon.stub( rotatorView.element, 'clientWidth' ).get( () => mockedWidth );

			balloon.showPanel( 'second' );

			expect( counterElement.classList.contains( 'ck-hidden' ) ).to.equal( false );

			mockedWidth = 200;
			balloon.showPanel( 'main' );

			expect( counterElement.classList.contains( 'ck-hidden' ) ).to.equal( true );

			mockedWidth = 201;
			balloon.updatePosition();

			expect( counterElement.classList.contains( 'ck-hidden' ) ).to.equal( false );
		} );

		it( 'should switch panel to the next one after clicking next button', () => {
			balloon.add( {
				view: viewB,
				panelId: 'second'
			} );

			balloon.add( {
				view: viewC,
				panelId: 'third'
			} );

			expect( balloon.visibleView ).to.equal( viewA );

			rotatorView.buttonNextView.fire( 'execute' );

			expect( balloon.visibleView ).to.equal( viewB );

			rotatorView.buttonNextView.fire( 'execute' );

			expect( balloon.visibleView ).to.equal( viewC );

			rotatorView.buttonNextView.fire( 'execute' );

			expect( balloon.visibleView ).to.equal( viewA );
		} );

		it( 'should not move focus to the editable when switching not focused view to the next one', () => {
			const editableFocusSpy = sinon.spy( editor.editing.view, 'focus' );

			balloon.add( {
				view: viewB,
				panelId: 'second'
			} );

			rotatorView.buttonNextView.fire( 'execute' );

			sinon.assert.notCalled( editableFocusSpy );
		} );

		it( 'should move focus to the editable when switching focused view to the next one', () => {
			const editableFocusSpy = sinon.spy( editor.editing.view, 'focus' );

			balloon.add( {
				view: viewB,
				panelId: 'second'
			} );

			rotatorView.focusTracker.isFocused = true;

			rotatorView.buttonNextView.fire( 'execute' );

			sinon.assert.calledOnce( editableFocusSpy );
		} );

		it( 'should switch panel to the prev one after clicking prev button', () => {
			balloon.add( {
				view: viewB,
				panelId: 'second'
			} );

			balloon.add( {
				view: viewC,
				panelId: 'third'
			} );

			expect( balloon.visibleView ).to.equal( viewA );

			rotatorView.buttonPrevView.fire( 'execute' );

			expect( balloon.visibleView ).to.equal( viewC );

			rotatorView.buttonPrevView.fire( 'execute' );

			expect( balloon.visibleView ).to.equal( viewB );

			rotatorView.buttonPrevView.fire( 'execute' );

			expect( balloon.visibleView ).to.equal( viewA );
		} );

		it( 'should not move focus to the editable when switching not focused view to the prev one', () => {
			const editableFocusSpy = sinon.spy( editor.editing.view, 'focus' );

			balloon.add( {
				view: viewB,
				panelId: 'second'
			} );

			rotatorView.buttonPrevView.fire( 'execute' );

			sinon.assert.notCalled( editableFocusSpy );
		} );

		it( 'should move focus to the editable when switching focused view to the prev one', () => {
			const editableFocusSpy = sinon.spy( editor.editing.view, 'focus' );

			balloon.add( {
				view: viewB,
				panelId: 'second'
			} );

			rotatorView.focusTracker.isFocused = true;

			rotatorView.buttonPrevView.fire( 'execute' );

			sinon.assert.calledOnce( editableFocusSpy );
		} );
	} );
} );
