function isObject(value) {
    return typeof value === "object" && value !== null;
}

const READONLY_FLAG = Symbol("readonly-flag");

const readonlyHandlers = {
    get(target, key) {
        if (key === READONLY_FLAG)
            return true;
        let res = Reflect.get(target, key);
        if (isObject(res))
            res = readonly(res);
        return res;
    },
    set() {
        console.warn();
        return false;
    },
};
function readonly(raw) {
    return new Proxy(raw, readonlyHandlers);
}
const shallowReadonlyHandlers = Object.assign(readonlyHandlers, {
    get(target, key) {
        if (key === READONLY_FLAG)
            return true;
        let res = Reflect.get(target, key);
        return res;
    },
});
function shallowReadonly(raw) {
    return new Proxy(raw, shallowReadonlyHandlers);
}

function emit(instance, event, ...arg) {
    const { props } = instance;
    event = kebabToCamel(event);
    const handler = props["on" + event.charAt(0).toUpperCase() + event.slice(1)];
    if (handler)
        handler(...arg);
}
function kebabToCamel(str) {
    return str.replace(/-(\w)/g, (_, c) => c.toUpperCase());
}

function initProps(instance, rawProps) {
    if (rawProps)
        instance.props = rawProps || {};
}

const publicPropsMap = {
    $el: (i) => i.vnode.el,
    $slots: (i) => i.slots,
};
const publicInstanceProxyHandlers = {
    get({ _: instance }, key) {
        const getInstanceProp = publicPropsMap[key];
        if (getInstanceProp)
            return getInstanceProp(instance);
        const { setupState, props } = instance;
        if (hasKey(setupState, key)) {
            return setupState[key];
        }
        if (hasKey(props, key)) {
            return props[key];
        }
    },
};
function hasKey(target, key) {
    return Object.prototype.hasOwnProperty.call(target, key);
}

function initSlots(instance, children) {
    instance.slots = children;
}

let currentInstance;
function createComponentInstance(vnode, parent) {
    console.log("currenInstanceParent", parent);
    const instance = {
        vnode,
        type: vnode.type,
        setupState: {},
        props: {},
        slots: {},
        parent,
        provides: null,
        emit,
    };
    instance.emit = emit.bind(null, instance);
    instance.provides = Object.create(parent.provides || null);
    return instance;
}
function setupComponent(instance) {
    initProps(instance, instance.vnode.props);
    initSlots(instance, instance.vnode.children);
    setStatefulComponent(instance);
}
function setStatefulComponent(instance) {
    const component = instance.type;
    const { setup } = component;
    if (setup) {
        setCurrentInstance(instance);
        const setupReasult = setup(shallowReadonly(instance.props), {
            emit: instance.emit,
        });
        handleSetupResult(instance, setupReasult);
    }
    instance.proxy = new Proxy({ _: instance }, publicInstanceProxyHandlers);
}
function handleSetupResult(instance, setupReasult) {
    if (typeof setupReasult === "object") {
        instance.setupState = setupReasult;
    }
    finishComponentSetup(instance);
}
function finishComponentSetup(instance) {
    const component = instance.type;
    if (component.render) {
        instance.render = component.render;
    }
}
function getCurrentInstance() {
    return currentInstance;
}
function setCurrentInstance(instance) {
    currentInstance = instance;
}

function provide(key, value) {
    const currentInstance = getCurrentInstance();
    if (currentInstance) {
        const { provides } = currentInstance;
        provides[key] = value;
    }
}
function inject(key, defaultValue) {
    const currentInsstance = getCurrentInstance();
    if (currentInsstance) {
        const { provides } = currentInsstance;
        return (provides[key] ||
            (typeof defaultValue === "function" ? defaultValue() : defaultValue));
    }
}

const FRAGMENT_FLAG = Symbol("fragment");
const TEXT_FLAG = Symbol("text");

function createVnode(type, props, children) {
    const vnode = {
        type,
        props,
        children,
        vnode: null,
        shapeFlag: getShapeFlag(type),
    };
    if (typeof children === "string") {
        vnode.shapeFlag |= 4 /* SHAPEFLAG.TEXT_CHILDREN */;
    }
    else if (Array.isArray(children)) {
        vnode.shapeFlag |= 8 /* SHAPEFLAG.ARRAY_CHILDREN */;
    }
    else if (typeof children === "object") {
        vnode.shapeFlag |= 16 /* SHAPEFLAG.SLOTS_CHILDREN */;
    }
    return vnode;
}
function getShapeFlag(type) {
    return typeof type === "string"
        ? 1 /* SHAPEFLAG.ELEMENT */
        : 2 /* SHAPEFLAG.STATEFUL_COMPONENT */;
}
function createTextVnode(text) {
    return createVnode(TEXT_FLAG, {}, text);
}

function renderSlots(slots, name, info) {
    const slot = slots[name](info);
    if (Array.isArray(slot))
        return createVnode("fragment", {}, slot);
    return slot;
}

function render(vnode, container, parent) {
    // call patch here
    patch(vnode, container, parent);
}
function patch(vnode, container, parent) {
    // processComponent(vnode, container);
    const { shapeFlag, type } = vnode;
    if (type === FRAGMENT_FLAG) {
        processFragment(vnode, container, parent);
        return;
    }
    if (type === TEXT_FLAG) {
        processTextNode(vnode, container);
        return;
    }
    if (shapeFlag & 1 /* SHAPEFLAG.ELEMENT */) {
        processElement(vnode, container, parent);
    }
    else if (shapeFlag & 2 /* SHAPEFLAG.STATEFUL_COMPONENT */) {
        processComponent(vnode, container, parent);
    }
}
function processFragment(vnode, container, parent) {
    mountChildren(vnode.children, container, parent);
}
function processComponent(vnode, container, parent) {
    mountComponent(vnode, container, parent);
}
function mountComponent(vnode, container, parent) {
    const instance = createComponentInstance(vnode, parent);
    setupComponent(instance);
    setupRenderEffect(instance, container, vnode);
}
function setupRenderEffect(instance, container, vnode) {
    const { proxy } = instance;
    const subTree = instance.render.call(proxy);
    patch(subTree, container, instance);
    vnode.el = subTree.el;
}
function processElement(vnode, container, parent) {
    mountElement(vnode, container, parent);
}
function mountElement(vnode, container, parent) {
    let el = (vnode.el = document.createElement(vnode.type));
    const { children, shapeFlag } = vnode;
    if (shapeFlag & 4 /* SHAPEFLAG.TEXT_CHILDREN */) {
        el.textContent = children;
    }
    else if (shapeFlag & 8 /* SHAPEFLAG.ARRAY_CHILDREN */) {
        mountChildren(children, el, parent);
    }
    const { props } = vnode;
    for (const key in props) {
        if (isEvent(key)) {
            el.addEventListener(key.slice(2).toLowerCase(), props[key]);
        }
        else {
            el.setAttribute(key, props[key]);
        }
    }
    container.append(el);
}
function isEvent(key) {
    return /^on[A-Z]/.test(key);
}
function mountChildren(children, container, parent) {
    children.forEach((vnode) => {
        patch(vnode, container, parent);
    });
}
function processTextNode(vnode, container) {
    const { children } = vnode;
    let el = (vnode.el = document.createTextNode(children));
    container.append(el);
}

function createApp(rootComponent) {
    return {
        mount(selector) {
            // create vnode first
            const rootContainer = document.querySelector(selector);
            const vnode = createVnode(rootComponent);
            render(vnode, rootContainer, {});
        },
    };
}

function h(type, props, children) {
    return createVnode(type, props, children);
}

export { createApp, createTextVnode, getCurrentInstance, h, inject, provide, renderSlots };
