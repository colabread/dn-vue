const INTERPOLATION_REGEX = /\{\{(.+?)\}\}/;
const INTERPOLATION_ALL_REGEX = /\{\{(.+?)\}\}/g;

class Updater {
    static text(node, expr, data) {
        let value = '';
        if (expr.indexOf('{{') !== -1) {
            // 插值表达式
            value = expr.replace(INTERPOLATION_ALL_REGEX, (...args) => Updater.getValue(data, args[1].trim()));
        } else {
            // v-text指令
            value = Updater.getValue(data, expr);
        }
        node.textContent = value;
    }

    static html() {

    }

    static getValue(data, expr) {
        return expr.split('.').reduce((prev, cur) => data[cur], data);
    }
}

class Vue {
    constructor({ el, data }) {
        if (!el) throw new Error('el is necessary');
        this.$el = el;
        this.$data = data;
        new Compile({ el, data });
    }
}

class Compile {
    constructor({ el, data }) {
        this.$data = data;
        let app = null;
        if (Compile.isElementNode(el)) {
            app = el;
        } else {
            app = document.querySelector(el);
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

    static removeDirective(node, attr) {
        node.removeAttribute(attr);
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
            if (Compile.isDirective(name)) {
                const [, directive] = name.split('-');
                Updater[directive](node, value, this.$data);
                Compile.removeDirective(node, name);
            }
        })
    }

    compileTextNode(node) {
        const textContent = node.textContent;
        if (INTERPOLATION_REGEX.test(textContent)) {
            // {{}} 插值表达式
            Updater['text'](node, textContent, this.$data);
        }
        // 其他的情况不用管
    }
}