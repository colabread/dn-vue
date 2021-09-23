const INTERPOLATION_REGEX = /\{\{(.+?)\}\}/;
const INTERPOLATION_ALL_REGEX = /\{\{(.+?)\}\}/g;

class Vue {
    constructor({ el, data, methods }) {
        if (!el) throw new Error('el is necessary');
        this.$el = el;
        this.$data = data;
        this.$methods = methods;
        new Observer({ data });
        new Compile(this);

        window.vm = this;   // 测试用
    }
}

class Compile {
    constructor(vm) {
        this.$vm = vm;
        const { $el } = vm;
        let app = null;
        if (Compile.isElementNode($el)) {
            app = $el;
        } else {
            app = document.querySelector($el);
        }
        if (Compile.isElementNode(app)) {
            // 将根节点下的子节点创建为一个fragment，对这个fragment进行编译，以免直接操作根节点引起大量重绘和回流
            const fragment = Compile.node2fragment(app);
            this.compile(fragment);
            app.appendChild(fragment);
        } else {
            throw new Error('el is not a valid element node');
        }
    }

    static isElementNode(el) {
        return el && el.nodeType === 1;
    }

    static node2fragment(node) {
        const fragment = document.createDocumentFragment();
        [...node.childNodes].forEach(child => {
            fragment.appendChild(child);
        });
        return fragment;
    }

    static isDirective(attrName) {
        return attrName.startsWith('v-');
    }

    static removeAttribute(node, attr) {
        node.removeAttribute(attr);
    }

    static isAtEvent(attrName) {
        return attrName.startsWith('@');
    }

    compile(fragment) {
        [...fragment.childNodes].forEach(child => {
            if (Compile.isElementNode(child)) {
                this.compileElementNode(child);
            } else {
                this.compileTextNode(child);
            }
            if (child.childNodes && child.childNodes.length > 0) {
                this.compile(child);
            }
        })
    }

    compileElementNode(node) {
        const attrs = node.attributes;
        [...attrs].forEach(attr => {
            const { name, value } = attr;
            if (Compile.isDirective(name)) {    // v-directive
                const [, directive] = name.split('-');
                const [directiveName, eventName] = directive.split(':');
                Updater[directiveName](node, value, this.$vm, eventName);
                Compile.removeAttribute(node, name);
            } else if (Compile.isAtEvent(name)) {   // @event
                const [, directiveName] = name.split('@');
                Updater.on(node, value, this.$vm, directiveName);
                Compile.removeAttribute(node, name);
            }
        })
    }

    compileTextNode(node) {
        const textContent = node.textContent;
        if (INTERPOLATION_REGEX.test(textContent)) {    // {{}} 插值表达式
            Updater['text'](node, textContent, this.$vm);
        }
    }
}

class Updater {
    static text(node, expr, vm) {
        let value = '';
        if (expr.indexOf('{{') !== -1) {
            // 插值表达式
            value = expr.replace(INTERPOLATION_ALL_REGEX, (...args) => Updater.getValue(vm.$data, args[1].trim()));
        } else {
            // v-text指令
            new Watcher({
                vm,
                expr,
                cb: (newValue) => {
                    node.textContent = newValue;  // 发生在运行阶段，若干次
                }
            });
            value = Updater.getValue(vm.$data, expr);
        }
        node.textContent = value;
    }

    static html(node, value, vm) {
        new Watcher({
            vm,
            expr: value,
            cb: (newValue) => {
                node.innerHTML = newValue;  // 发生在运行阶段，若干次
            }
        });
        node.innerHTML = Updater.getValue(vm.$data, value); // 发生在编译阶段，仅一次
    }

    static model(node, value, vm) {
        // 默认仅实现input标签
        new Watcher({
            vm,
            expr: value,
            cb: (newValue) => {
                node.value = newValue;  // 发生在运行阶段，若干次
            }
        });
        node.value = Updater.getValue(vm.$data, value);
        node.addEventListener('input', (e) => {
            const newValue = e.target.value;
            vm.$data[value] = newValue;
        }, false);
    }

    static on(node, value, vm, eventName) {
        const func = vm.$methods[value];
        if (!func || typeof func !== 'function') {
            throw new Error(`${value} is not a valid function`);
        }
        node.addEventListener(eventName, func.bind(vm), false);
    }

    static getValue(data, expr) {
        return expr.split('.').reduce((prev, cur) => {
            return prev[cur];
        }, data);
    }
}

class Observer {
    constructor({ data }) {
        Observer.observe(data);
    }

    static observe(data) {
        if (data && typeof data === 'object') {
            Object.keys(data).forEach(key => {
                Observer.defineReactive(data, key, data[key]);
            })
        }
    }

    static defineReactive(data, key, value) {
        const dep = new Dep();
        Object.defineProperty(data, key, {
            enumerable: true,
            configurable: false,
            get() {
                Dep.target && dep.addWatcher(Dep.target);
                return value;   // 通过闭包访问局部变量value
            },
            set(newValue) {
                if (newValue !== value) {
                    Observer.observe(newValue); // 如果newValue是对象，会将原来的get、set销毁，所以需要重新监听
                    value = newValue;
                    dep.notify();
                }
            }
        });
        Observer.observe(value);
    }
}

class Dep {
    constructor() {
        this.watchers = [];
    }

    addWatcher(watcher) {
        this.watchers.push(watcher);
    }

    notify() {
        this.watchers.forEach(watcher => {
            watcher.update();
        })
    }
}

class Watcher {
    constructor({ vm, expr, cb }) {
        this.$vm = vm;
        this.$expr = expr;
        this.$cb = cb;
        this.putThisInDep();
    }

    putThisInDep() {
        Dep.target = this;
        Updater.getValue(this.$vm.$data, this.$expr);
        Dep.target = null;
    }

    update() {
        const newValue = Updater.getValue(this.$vm.$data, this.$expr);
        this.$cb(newValue);
    }
}