export class BaseToggleable {
    constructor(buttonId, containerId, activeClass = 'active') {
        this.isOpen = false;

        // If IDs are provided, set up DOM elements automatically
        if (buttonId) {
            this.button = document.getElementById(buttonId);
            if (this.button) {
                this.button.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggle();
                });
            }
        }

        if (containerId) {
            this.container = document.getElementById(containerId);
        }

        this.activeClass = activeClass;
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        this.isOpen = true;
        if (this.container && this.activeClass) {
            this.container.classList.add(this.activeClass);
        }
        if (this.button) {
            this.button.setAttribute('aria-expanded', 'true');
        }
    }

    close() {
        this.isOpen = false;
        if (this.container && this.activeClass) {
            this.container.classList.remove(this.activeClass);
        }
        if (this.button) {
            this.button.setAttribute('aria-expanded', 'false');
        }
    }
}
