import Sortable, { MultiDrag, SortableEvent } from 'sortablejs';

Sortable.mount(new MultiDrag());

class SortableBase {
	protected readonly config: any;

	constructor() {
		this.config = JSON.parse(document.getElementById('admin_sortable2_config')?.textContent ?? '');
	}
}


class ListSortable extends SortableBase {
	private readonly tableBody: HTMLTableSectionElement;
	private readonly sortable: Sortable;
	private readonly observer: MutationObserver;
	private firstOrder: number | undefined;
	private orderDirection: number | undefined;

	constructor(table: HTMLTableElement) {
		super();
		this.tableBody = table.querySelector('tbody')!;
		this.sortable = Sortable.create(this.tableBody, {
			animation: 150,
			handle: '.handle',
			draggable: 'tr',
			selectedClass: 'selected',
			multiDrag: true,
			onStart: event => this.onStart(event),
			onEnd: event => this.onEnd(event),
		});
		this.observer = new MutationObserver(mutationsList => this.selectActionChanged(mutationsList));
		const tableRows = this.tableBody.querySelectorAll('tr');
		tableRows.forEach(tableRow => this.observer.observe(tableRow, {attributes: true}));
	}

	private selectActionChanged(mutationsList: Array<MutationRecord>) {
		for (const mutation of mutationsList) {
			if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
				const tableRow = mutation.target as HTMLTableRowElement;
				if (tableRow.classList.contains('selected')) {
					Sortable.utils.select(tableRow);
				} else {
					Sortable.utils.deselect(tableRow);
				}
			}
		}
	}

	private async onStart(evt: SortableEvent) {
		evt.oldIndex;  // element index within parent
		const firstOrder = this.tableBody.querySelector('tr:first-child')?.querySelector('.handle')?.getAttribute('order');
		const lastOrder = this.tableBody.querySelector('tr:last-child')?.querySelector('.handle')?.getAttribute('order');
		if (firstOrder && lastOrder) {
			this.firstOrder = parseInt(firstOrder);
			this.orderDirection = parseInt(lastOrder) > this.firstOrder ? 1 : -1;
		}
	}

	private async onEnd(evt: SortableEvent) {
		if (typeof evt.newIndex !== 'number' || typeof evt.oldIndex !== 'number'
			|| typeof this.firstOrder !== 'number'|| typeof this.orderDirection !== 'number'
			|| !(evt.item instanceof HTMLTableRowElement))
			return;

		let order = this.firstOrder;
		for (let row of this.tableBody.querySelectorAll('tr')) {
			row.querySelector('.handle')?.setAttribute('order', String(order));
			order += this.orderDirection;
		}

		let firstChild: number, lastChild: number;
		if (evt.items.length === 0) {
			// single dragged item
			if (evt.newIndex < evt.oldIndex) {
				// drag up
				firstChild = evt.newIndex;
				lastChild = evt.oldIndex;
			} else if (evt.newIndex > evt.oldIndex) {
				// drag down
				firstChild = evt.oldIndex;
				lastChild = evt.newIndex;
			} else {
				return;
			}
		} else {
			// multiple dragged items
			firstChild = this.tableBody.querySelectorAll('tr').length;
			lastChild = 0;
			evt.oldIndicies.forEach(item => {
				firstChild = Math.min(firstChild, item.index)
				lastChild = Math.max(lastChild, item.index)
			});
			evt.newIndicies.forEach(item => {
				firstChild = Math.min(firstChild, item.index)
				lastChild = Math.max(lastChild, item.index)
			});
		}
		const updatedRows = this.tableBody.querySelectorAll(`tr:nth-child(n+${firstChild + 1}):nth-child(-n+${lastChild + 1})`);;
		if (updatedRows.length === 0)
			return;
		console.log(updatedRows);
 		const updatedItems = new Map<string, string>();
		for (let row of updatedRows) {
			const pk = row.querySelector('.handle')?.getAttribute('pk');
			const order = row.querySelector('.handle')?.getAttribute('order');
			if (pk && order) {
				updatedItems.set(pk, order);
			}
		}
		console.log(updatedItems);
		const response = await fetch(this.config.update_url, {
			method: 'POST',
			headers: this.headers,
			body: JSON.stringify({
				updatedItems: Array.from(updatedItems.entries()),
			})
		});
		if (response.status !== 200) {
			console.error(`The server responded: ${response.statusText}`);
		}
	}

	private resetActions() {
		// reset default action checkboxes behaviour
		if (!window.hasOwnProperty('Actions'))
			return;
		const actionsEls = this.tableBody.querySelectorAll('tr input.action-select');
		actionsEls.forEach(elem => {
			const tableRow = elem.closest('tr');
			// @ts-ignore
			Sortable.utils.deselect(tableRow);
			tableRow?.classList.remove('selected');
			(elem as HTMLInputElement).checked = false;
		});
		// @ts-ignore
		window.Actions(actionsEls);
	}

	public get headers(): Headers {
		const value = `; ${document.cookie}`;
		const parts = value.split('; csrftoken=');
		const csrfToken = parts.length === 2 ? parts[1].split(';').shift() : null;
		const headers = new Headers();
		headers.append('Accept', 'application/json');
		headers.append('Content-Type', 'application/json');
		if (csrfToken) {
			headers.append('X-CSRFToken', csrfToken);
		}
		return headers;
	}
}


class ActionForm extends SortableBase {
	private readonly selectElement: HTMLSelectElement;
	private readonly stepInput: HTMLInputElement;
	private readonly pageInput: HTMLInputElement;

	constructor(formElement: HTMLElement) {
		super();
		formElement.setAttribute('novalidate', 'novalidate');
		this.selectElement = formElement.querySelector('select[name="action"]')!;
		this.selectElement.addEventListener('change', () => this.actionChanged());

		this.stepInput = document.getElementById('changelist-form-step') as HTMLInputElement;
		this.stepInput.setAttribute('min', '1');
		const max = Math.max(this.config.total_pages - this.config.current_page, this.config.current_page);
		this.stepInput.setAttribute('max', `${max}`);
		this.stepInput.value = '1';

		this.pageInput = document.getElementById('changelist-form-page') as HTMLInputElement;
		this.pageInput.setAttribute('min', '1');
		this.pageInput.setAttribute('max', `${this.config.total_pages}`);
		this.pageInput.value = `${this.config.current_page}`;
	}

	private actionChanged() {
		this.pageInput.style.display = this.stepInput.style.display = 'none';
		switch (this.selectElement?.value) {
			case 'move_to_exact_page':
				this.pageInput.style.display = 'inline-block';
				break;
			case 'move_to_forward_page':
				this.stepInput.style.display = 'inline-block';
				break;
			case 'move_to_back_page':
				this.stepInput.style.display = 'inline-block';
				break;
			case 'move_to_first_page':
				this.pageInput.value = '1';
				break;
			case 'move_to_last_page':
				this.pageInput.value = `${this.config.total_pages + 1}`;
				break;
			default:
				break;
		}
	}
}


class InlineSortable {
	private readonly sortable: Sortable;
	private readonly reversed: boolean;
	private readonly itemSelectors: string;

	constructor(inlineFieldSet: HTMLFieldSetElement) {
		this.reversed = inlineFieldSet.classList.contains('reversed');
		const tBody = inlineFieldSet.querySelector('table tbody') as HTMLTableSectionElement;
		if (tBody) {
			// tabular inline
			this.itemSelectors = 'tr.has_original'
			this.sortable = Sortable.create(tBody, {
				animation: 150,
				handle: 'td.original p',
				draggable: 'tr',
				onEnd: event => this.onEnd(event),
			});
		} else {
			// stacked inline
			this.itemSelectors = '.inline-related.has_original'
			this.sortable = Sortable.create(inlineFieldSet, {
				animation: 150,
				handle: 'h3',
				draggable: '.inline-related.has_original',
				onEnd: event => this.onEnd(event),
			});
		}
	}

	private onEnd(evt: SortableEvent) {
		const originals = this.sortable.el.querySelectorAll(this.itemSelectors);
		if (this.reversed) {
			originals.forEach((element: Element, index: number) => {
				const reorderInputElement = element.querySelector('input._reorder_') as HTMLInputElement;
				reorderInputElement.value = `${originals.length - index}`;
			});
		} else {
			originals.forEach((element: Element, index: number) => {
				const reorderInputElement = element.querySelector('input._reorder_') as HTMLInputElement;
				reorderInputElement.value = `${index + 1}`;
			});
		}
	}
}


window.addEventListener('load', (event) => {
	const table = document.getElementById('result_list');
	if (table instanceof HTMLTableElement) {
		new ListSortable(table);
	}

	const changelistForm = document.getElementById('changelist-form');
	if (changelistForm) {
		new ActionForm(changelistForm);
	}

	for (let inlineFieldSet of document.querySelectorAll('fieldset.sortable')) {
		new InlineSortable(inlineFieldSet as HTMLFieldSetElement);
	}
});
