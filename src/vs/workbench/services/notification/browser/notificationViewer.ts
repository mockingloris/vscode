/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/notificationList';
import { IDelegate, IRenderer } from 'vs/base/browser/ui/list/list';
import { INotificationViewItem, NotificationViewItem } from 'vs/workbench/services/notification/common/notificationsModel';
import { renderMarkdown } from 'vs/base/browser/htmlContentRenderer';
import { clearNode, addClass, removeClass, toggleClass } from 'vs/base/browser/dom';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import URI from 'vs/base/common/uri';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Severity } from 'vs/platform/message/common/message';
import { localize } from 'vs/nls';
import { Button } from 'vs/base/browser/ui/button/button';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Action, ActionRunner, IAction } from 'vs/base/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

export class NotificationsListDelegate implements IDelegate<INotificationViewItem> {

	private static readonly ROW_HEIGHT = 48;
	private static readonly LINE_HEIGHT = 22;

	private offsetHelper: HTMLElement;

	constructor(container: HTMLElement) {
		this.offsetHelper = this.createOffsetHelper(container);
	}

	private createOffsetHelper(container: HTMLElement): HTMLElement {
		const offsetHelper = document.createElement('div');
		offsetHelper.style.opacity = '0';
		offsetHelper.style.position = 'absolute'; // do not mess with the visual layout
		offsetHelper.style.width = '100%'; // ensure to fill contauner to measure true width
		offsetHelper.style.overflow = 'hidden'; // do not overflow
		offsetHelper.style.whiteSpace = 'nowrap'; // do not wrap to measure true width

		container.appendChild(offsetHelper);

		return offsetHelper;
	}

	public getHeight(element: INotificationViewItem): number {

		// First row: message and actions
		let expandedHeight = NotificationsListDelegate.ROW_HEIGHT;

		if (!element.expanded) {
			return expandedHeight; // return early if there are no more rows to show
		}

		// Dynamic height: if message overflows
		const preferredMessageHeight = this.computePreferredRows(element.message) * NotificationsListDelegate.LINE_HEIGHT;
		const messageOverflows = expandedHeight < preferredMessageHeight;
		if (messageOverflows) {
			const overflow = preferredMessageHeight - expandedHeight;
			expandedHeight += overflow;
		}

		// Add some padding to separate from actions if any
		if (messageOverflows && element.actions.length > 0) {
			expandedHeight += NotificationsListDelegate.LINE_HEIGHT;
		}

		// Last row: source and actions
		expandedHeight += NotificationsListDelegate.ROW_HEIGHT;

		return expandedHeight;
	}

	private computePreferredRows(message: IMarkdownString): number {

		// Render message markdown into offset helper
		const renderedMessage = NotificationMarkdownRenderer.render(message);
		this.offsetHelper.appendChild(renderedMessage);

		// Compute message width taking overflow into account
		const messageWidth = Math.max(renderedMessage.scrollWidth, renderedMessage.offsetWidth);

		// One row per exceeding the total width of the container
		const availableWidth = this.offsetHelper.offsetWidth - (20 /* paddings */ + 22 /* severity */ + 48 /* toolbar */);
		const preferredRows = Math.ceil(messageWidth / availableWidth);

		// Always clear offset helper after use
		clearNode(this.offsetHelper);

		return preferredRows;
	}

	public getTemplateId(element: INotificationViewItem): string {
		if (element instanceof NotificationViewItem) {
			return NotificationRenderer.TEMPLATE_ID;
		}

		return void 0;
	}
}

export interface INotificationTemplateData {
	container: HTMLElement;
	toDispose: IDisposable[];

	mainRow: HTMLElement;
	icon: HTMLElement;
	message: HTMLElement;
	toolbar: ActionBar;

	detailsRow: HTMLElement;
	source: HTMLElement;
	actionsContainer: HTMLElement;
}

class NotificationMarkdownRenderer {

	private static readonly MARKED_NOOP = (text?: string) => text || '';
	private static readonly MARKED_NOOP_TARGETS = [
		'blockquote', 'br', 'code', 'codespan', 'del', 'em', 'heading', 'hr', 'html',
		'image', 'list', 'listitem', 'paragraph', 'strong', 'table', 'tablecell',
		'tablerow'
	];

	public static render(markdown: IMarkdownString, actionCallback?: (content: string) => void): HTMLElement {
		return renderMarkdown(markdown, {
			inline: true,
			joinRendererConfiguration: renderer => NotificationMarkdownRenderer.MARKED_NOOP_TARGETS.forEach(fn => renderer[fn] = NotificationMarkdownRenderer.MARKED_NOOP),
			actionCallback
		});
	}
}

class CloseNotificationAction extends Action {

	public static readonly ID = 'workbench.action.closeNotification';
	public static readonly LABEL = localize('closeNotification', "Close Notification");

	constructor(
		id: string,
		label: string
	) {
		super(id, label, 'close-notification-action');
	}

	public run(context: INotificationViewItem): TPromise<any> {
		return TPromise.as(void 0); // TODO@notification
	}
}

class ExpandNotificationAction extends Action {

	public static readonly ID = 'workbench.action.expandNotification';
	public static readonly LABEL = localize('expandNotification', "Expand Notification");

	constructor(
		id: string,
		label: string
	) {
		super(id, label, 'expand-notification-action');
	}

	public run(context: INotificationViewItem): TPromise<any> {
		context.expand();

		return TPromise.as(void 0); // TODO@notification
	}
}

class CollapseNotificationAction extends Action {

	public static readonly ID = 'workbench.action.collapseNotification';
	public static readonly LABEL = localize('collapseNotification', "Collapse Notification");

	constructor(
		id: string,
		label: string
	) {
		super(id, label, 'collapse-notification-action');
	}

	public run(context: INotificationViewItem): TPromise<any> {
		context.collapse();

		return TPromise.as(void 0); // TODO@notification
	}
}

class CloseNotificationActionRunner extends ActionRunner {

	constructor(private context: INotificationViewItem) {
		super();
	}

	public run(action: IAction, context?: any): TPromise<void> {
		return super.run(action, this.context);
	}
}

export class NotificationRenderer implements IRenderer<INotificationViewItem, INotificationTemplateData> {

	public static readonly TEMPLATE_ID = 'notification';

	private static readonly SEVERITIES: ('info' | 'warning' | 'error')[] = ['info', 'warning', 'error'];

	private closeNotificationAction: CloseNotificationAction;
	private expandNotificationAction: ExpandNotificationAction;
	private collapseNotificationAction: ExpandNotificationAction;

	constructor(
		@IOpenerService private openerService: IOpenerService,
		@IThemeService private themeService: IThemeService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this.closeNotificationAction = instantiationService.createInstance(CloseNotificationAction, CloseNotificationAction.ID, CloseNotificationAction.LABEL);
		this.expandNotificationAction = instantiationService.createInstance(ExpandNotificationAction, ExpandNotificationAction.ID, ExpandNotificationAction.LABEL);
		this.collapseNotificationAction = instantiationService.createInstance(CollapseNotificationAction, CollapseNotificationAction.ID, CollapseNotificationAction.LABEL);
	}

	public get templateId() {
		return NotificationRenderer.TEMPLATE_ID;
	}

	public renderTemplate(container: HTMLElement): INotificationTemplateData {
		const data: INotificationTemplateData = Object.create(null);
		data.toDispose = [];

		// Container
		data.container = document.createElement('div');
		addClass(data.container, 'notification-list-item');

		// Main Row
		data.mainRow = document.createElement('div');
		addClass(data.mainRow, 'notification-list-item-main-row');

		// Icon
		data.icon = document.createElement('div');
		addClass(data.icon, 'notification-list-item-icon');

		// Message
		data.message = document.createElement('div');
		addClass(data.message, 'notification-list-item-message');

		// Toolbar
		const toolbarContainer = document.createElement('div');
		addClass(toolbarContainer, 'notification-list-item-toolbar-container');

		data.toolbar = new ActionBar(toolbarContainer, { ariaLabel: localize('notificationActions', "Notification actions") });

		// Details Row
		data.detailsRow = document.createElement('div');
		addClass(data.detailsRow, 'notification-list-item-details-row');

		// Source
		data.source = document.createElement('div');
		addClass(data.source, 'notification-list-item-source');

		// Buttons Container
		data.actionsContainer = document.createElement('div');
		addClass(data.actionsContainer, 'notification-list-item-actions-container');

		container.appendChild(data.container);

		data.container.appendChild(data.mainRow);
		data.mainRow.appendChild(data.icon);
		data.mainRow.appendChild(data.message);
		data.mainRow.appendChild(toolbarContainer);

		data.container.appendChild(data.detailsRow);
		data.detailsRow.appendChild(data.source);
		data.detailsRow.appendChild(data.actionsContainer);

		return data;
	}

	private toSeverity(severity: 'info' | 'warning' | 'error'): Severity {
		switch (severity) {
			case 'info':
				return Severity.Info;
			case 'warning':
				return Severity.Warning;
			case 'error':
				return Severity.Error;
		}
	}

	public renderElement(element: INotificationViewItem, index: number, data: INotificationTemplateData): void {

		// Container
		toggleClass(data.container, 'expanded', element.expanded);

		// Icon
		NotificationRenderer.SEVERITIES.forEach(severity => {
			const domAction = element.severity === this.toSeverity(severity) ? addClass : removeClass;
			domAction(data.icon, `icon-${severity}`);
		});

		// Message (simple markdown with links support)
		clearNode(data.message);
		data.message.appendChild(NotificationMarkdownRenderer.render(element.message, (content: string) => this.openerService.open(URI.parse(content)).then(void 0, onUnexpectedError)));

		// Toolbar
		data.toolbar.clear();

		const actions: IAction[] = [];
		if (element.canCollapse) {
			actions.push(element.expanded ? this.collapseNotificationAction : this.expandNotificationAction);
		}
		actions.push(this.closeNotificationAction);

		data.toolbar.push(actions, { icon: true, label: false });
		data.toolbar.actionRunner = new CloseNotificationActionRunner(element);
		data.toDispose.push(data.toolbar.actionRunner);

		// Source
		if (element.expanded) {
			data.source.innerText = localize('notificationSource', "Source: {0}", element.source);
		} else {
			data.source.innerText = '';
		}

		// Actions
		clearNode(data.actionsContainer);
		if (element.expanded) {
			element.actions.forEach(action => {
				const button = new Button(data.actionsContainer);
				data.toDispose.push(attachButtonStyler(button, this.themeService));

				button.label = action.label;
				button.onDidClick(() => action.run());
			});
		}
	}

	public disposeTemplate(templateData: INotificationTemplateData): void {
		templateData.toolbar.dispose();
		templateData.toDispose = dispose(templateData.toDispose);
	}
}