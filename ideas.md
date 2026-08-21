# Dirección de diseño

## Tres enfoques explorados

### Cartografía técnica sobria
**Introducción breve:** Una interfaz de plano con jerarquías serenas, señales de estado precisas y controles que no compiten con el lienzo. Busca minimizar los errores de colocación mediante claridad funcional.

**Probabilidad:** 0.07

### Estudio de ingeniería editorial
**Introducción breve:** Una lectura inspirada en bitácoras técnicas impresas, con rótulos meticulosos, líneas de referencia y una cadencia tipográfica alta. Convierte la configuración en una experiencia de documentación activa.

**Probabilidad:** 0.03

### Taller industrial cromático
**Introducción breve:** Un entorno operativo más expresivo que identifica cada categoría mediante bloques cromáticos y pictogramas robustos. Prioriza la detección visual rápida en pantallas de trabajo.

**Probabilidad:** 0.09

## Enfoque elegido: Cartografía técnica sobria

### Movimiento de diseño
**Diseño de sistemas de control industrial contemporáneo**, con una capa de precisión cartográfica: el lienzo es el espacio dominante y el resto de la interfaz actúa como instrumental de apoyo.

### Principios centrales

1. El plano tiene la mayor prioridad visual y nunca queda oculto por controles decorativos.
2. La categoría seleccionada debe expresarse con una señal visual inequívoca y persistente.
3. Las propiedades describen exclusivamente el objeto activo; no se mezclan atributos ni acciones de otras categorías.
4. La reducción del error pesa más que la densidad de controles; los estados inválidos se bloquean con claridad.

### Filosofía de color
La base debe ser neutra y fría para dar estabilidad a una herramienta técnica. Cada tipo de elemento conserva un acento funcional propio: **cian** para cámaras, **ámbar** para cajas y **violeta grisáceo** para tuberías. El color no es decoración: anuncia el modo y el tipo de objeto sobre el plano.

### Paradigma de composición
Una composición de **lienzo operativo con carriles laterales**: herramientas a la izquierda, plano al centro y propiedades contextuales a la derecha. No se centralizan tarjetas de forma innecesaria; los controles acompañan la dirección natural de trabajo.

### Elementos distintivos

1. Un indicador de herramienta activa con color, icono y texto de estado.
2. Chips de categoría en la cabecera de propiedades que verifican el tipo del elemento seleccionado.
3. Una leyenda compacta que conserva el mapeo entre los colores y los elementos del plano.

### Filosofía de interacción
Toda acción debe confirmar su alcance antes de que el usuario continúe: seleccionar una cámara crea o edita únicamente cámaras; seleccionar una caja trabaja únicamente con cajas; trazar una tubería no crea objetos discretos. Los botones reflejan el tipo de elemento que afectarán.

### Animación
Las transiciones de selección usan únicamente opacidad y transformación, con entrada breve de 160–220 ms y la curva `cubic-bezier(0.23, 1, 0.32, 1)`. Los cambios de herramienta actualizan el indicador con un desplazamiento corto de 4 px; las interacciones frecuentes no llevan animaciones llamativas. Se respeta `prefers-reduced-motion`.

### Sistema tipográfico
**IBM Plex Sans** se usa para etiquetas, campos y datos técnicos por su legibilidad compacta; **Space Grotesk** se reserva para cabeceras, estados principales y numeración. Las propiedades usan etiquetas pequeñas en mayúsculas moderadas y valores de tamaño medio, evitando peso excesivo.

### Esencia de marca
**Una herramienta de plano para equipos de seguridad que necesitan configurar cada componente sin ambigüedad.** Personalidad: precisa, calmada y responsable.

### Voz de marca
Los títulos nombran la tarea concreta y la microcopia anticipa el resultado de cada acción. Las llamadas a la acción deben ser directas y verificables, no promocionales.

Ejemplos: “Tubería activa: define el siguiente tramo en el plano.” y “Propiedades de cámara: estos cambios no afectarán a cajas ni tuberías.”

### Logotipo y marca gráfica
Un símbolo modular de tres nodos conectados por una retícula técnica: un lente circular, un cuadrado de caja y un trazo lineal de tubería. La marca expresa que hay tres categorías conectadas, pero operativamente independientes.

### Color distintivo de marca
**Azul Plano `#1783B8`**, un azul técnico de alta legibilidad que identifica los estados generales de navegación y control.

## Style Decisions

- Las pantallas de acceso incorporan siempre una señal cartográfica visible: retícula técnica, referencias de coordenadas y una micro-leyenda de las tres categorías.
- La marca usa un símbolo modular de lente, caja y trazo de tubería conectados; se descarta el icono de escudo genérico.
- Los mensajes de autenticación son operativos y sitúan al usuario en el plano o en una inspección; no usan llamados a la acción genéricos.
- Las pantallas de acceso se componen como una estación de control sobre la retícula técnica: divisiones precisas, rótulos de estado y geometría contenida en vez de una tarjeta SaaS genérica.
- El estado de acceso no nombra proveedores ni infraestructura; se expresa como autorización operativa para el plano.
- Cian, ámbar y violeta grisáceo se mantienen visibles como códigos persistentes de cámara, caja y tubería.
- Los formularios de acceso se tratan como paneles de consola: grupos de campo encuadrados, líneas de referencia y acciones con lectura de estado, sin apariencia de formulario SaaS genérico.
- La marca combina de forma inseparable el símbolo modular de tres nodos, el rótulo de control de obra y el wordmark técnico de TRACKING LA NUBIA.
- Los acentos de categoría reaparecen como rieles y marcas de verificación operativa en el acceso, no solo como una leyenda decorativa.
- La micro-leyenda de acceso nombra siempre el código funcional completo: cian/cámara, ámbar/caja y violeta grisáceo/tubería.
- El wordmark integra cortes y módulos del símbolo de tres nodos; nunca se presenta como texto plano sin señal gráfica.
- Toda microcopia secundaria del acceso describe autorización, credencial, inspección o carga de contexto de plano.
