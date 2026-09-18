<?php
/**
 * Plugin Name:       Chat AZZAO
 * Plugin URI:        https://azzao.com
 * Description:       Agrega el asistente de chat de AZZAO al sitio. Configure la dirección del servidor del bot en Ajustes → Chat AZZAO.
 * Version:           1.0.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            AZZAO
 * License:           GPL-2.0-or-later
 * Text Domain:       azzao-chat
 */

// Si alguien abre este archivo directo desde el navegador, no pasa nada.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'AZZAO_CHAT_VERSION', '1.0.0' );
define( 'AZZAO_CHAT_OPCIONES', 'azzao_chat_opciones' );

/**
 * Valores por defecto.
 */
function azzao_chat_opciones() {
	$guardadas = get_option( AZZAO_CHAT_OPCIONES, array() );

	return wp_parse_args(
		is_array( $guardadas ) ? $guardadas : array(),
		array(
			'servidor'   => '',
			'activo'     => 1,
			'saludo'     => '',
			'invitacion' => '',
			'posicion'   => 'derecha',
			'ocultar_en' => '',
		)
	);
}

/* -------------------------------------------------------------------------
 * 1. Cargar el widget en el pie de página
 * ---------------------------------------------------------------------- */

/**
 * Decide si el chat debe aparecer en la página que se está viendo.
 */
function azzao_chat_debe_mostrarse( $opciones ) {
	if ( empty( $opciones['activo'] ) || empty( $opciones['servidor'] ) ) {
		return false;
	}

	// Nunca en el panel de administración ni en el editor.
	if ( is_admin() ) {
		return false;
	}

	// Páginas donde el administrador pidió ocultarlo (una ruta por línea).
	$ocultar = array_filter( array_map( 'trim', explode( "\n", (string) $opciones['ocultar_en'] ) ) );
	if ( $ocultar ) {
		$actual = trailingslashit( wp_parse_url( home_url( add_query_arg( array() ) ), PHP_URL_PATH ) );
		foreach ( $ocultar as $ruta ) {
			if ( trailingslashit( '/' . ltrim( $ruta, '/' ) ) === $actual ) {
				return false;
			}
		}
	}

	return true;
}

/**
 * Encola el script del widget con sus atributos data-*.
 */
function azzao_chat_encolar() {
	$opciones = azzao_chat_opciones();

	if ( ! azzao_chat_debe_mostrarse( $opciones ) ) {
		return;
	}

	$servidor = untrailingslashit( esc_url_raw( $opciones['servidor'] ) );

	wp_enqueue_script(
		'azzao-chat-widget',
		$servidor . '/widget.js',
		array(),
		AZZAO_CHAT_VERSION,
		true // en el pie de página, para no frenar la carga del sitio
	);
}
add_action( 'wp_enqueue_scripts', 'azzao_chat_encolar' );

/**
 * Añade los atributos data-* a la etiqueta <script>, que es como el widget
 * recibe su configuración.
 */
function azzao_chat_atributos( $etiqueta, $handle ) {
	if ( 'azzao-chat-widget' !== $handle ) {
		return $etiqueta;
	}

	$opciones = azzao_chat_opciones();
	$servidor = untrailingslashit( esc_url_raw( $opciones['servidor'] ) );

	$datos = ' data-api="' . esc_attr( $servidor ) . '"';

	if ( ! empty( $opciones['saludo'] ) ) {
		$datos .= ' data-saludo="' . esc_attr( $opciones['saludo'] ) . '"';
	}
	if ( ! empty( $opciones['invitacion'] ) ) {
		$datos .= ' data-invitacion="' . esc_attr( $opciones['invitacion'] ) . '"';
	}
	if ( 'izquierda' === $opciones['posicion'] ) {
		$datos .= ' data-posicion="izquierda"';
	}

	return str_replace( ' src=', $datos . ' src=', $etiqueta );
}
add_filter( 'script_loader_tag', 'azzao_chat_atributos', 10, 2 );

/* -------------------------------------------------------------------------
 * 2. Pantalla de configuración
 * ---------------------------------------------------------------------- */

function azzao_chat_menu() {
	add_options_page(
		'Chat AZZAO',
		'Chat AZZAO',
		'manage_options',
		'azzao-chat',
		'azzao_chat_pantalla'
	);
}
add_action( 'admin_menu', 'azzao_chat_menu' );

function azzao_chat_registrar_ajustes() {
	register_setting(
		'azzao_chat_grupo',
		AZZAO_CHAT_OPCIONES,
		array( 'sanitize_callback' => 'azzao_chat_limpiar' )
	);
}
add_action( 'admin_init', 'azzao_chat_registrar_ajustes' );

/**
 * Limpia lo que el administrador escribió antes de guardarlo.
 */
function azzao_chat_limpiar( $entrada ) {
	return array(
		'servidor'   => esc_url_raw( untrailingslashit( trim( (string) ( $entrada['servidor'] ?? '' ) ) ) ),
		'activo'     => empty( $entrada['activo'] ) ? 0 : 1,
		'saludo'     => sanitize_text_field( (string) ( $entrada['saludo'] ?? '' ) ),
		'invitacion' => sanitize_text_field( (string) ( $entrada['invitacion'] ?? '' ) ),
		'posicion'   => ( 'izquierda' === ( $entrada['posicion'] ?? '' ) ) ? 'izquierda' : 'derecha',
		'ocultar_en' => sanitize_textarea_field( (string) ( $entrada['ocultar_en'] ?? '' ) ),
	);
}

function azzao_chat_pantalla() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}

	$o      = azzao_chat_opciones();
	$campo  = AZZAO_CHAT_OPCIONES;
	$listo  = ! empty( $o['servidor'] );
	$seguro = $listo && 0 === strpos( $o['servidor'], 'https://' );
	?>
	<div class="wrap">
		<h1>Chat AZZAO</h1>

		<?php if ( ! $listo ) : ?>
			<div class="notice notice-warning">
				<p><strong>Falta un paso.</strong> Escriba abajo la dirección donde está
				corriendo el servidor del bot. Mientras esté vacía, el chat no aparece
				en el sitio.</p>
			</div>
		<?php elseif ( ! $seguro ) : ?>
			<div class="notice notice-error">
				<p><strong>La dirección debe empezar por <code>https://</code>.</strong>
				Si el sitio es seguro y el bot no, el navegador bloquea el chat y no
				se ve nada.</p>
			</div>
		<?php else : ?>
			<div class="notice notice-success">
				<p>El chat está configurado. Abra el sitio en una ventana de incógnito
				para verlo.</p>
			</div>
		<?php endif; ?>

		<form method="post" action="options.php">
			<?php settings_fields( 'azzao_chat_grupo' ); ?>

			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="azzao_servidor">Dirección del bot</label></th>
					<td>
						<input name="<?php echo esc_attr( $campo ); ?>[servidor]"
						       id="azzao_servidor" type="url" class="regular-text"
						       placeholder="https://chat.azzao.com"
						       value="<?php echo esc_attr( $o['servidor'] ); ?>">
						<p class="description">
							Donde está corriendo el servidor del chat. Sin barra al final.
							Recuerde autorizar este sitio en la variable
							<code>DOMINIOS_PERMITIDOS</code> del bot.
						</p>
					</td>
				</tr>

				<tr>
					<th scope="row">Estado</th>
					<td>
						<label>
							<input type="checkbox" name="<?php echo esc_attr( $campo ); ?>[activo]"
							       value="1" <?php checked( $o['activo'], 1 ); ?>>
							Mostrar el chat en el sitio
						</label>
						<p class="description">
							Desmárquelo para apagar el chat sin desinstalar el plugin.
							Útil mientras el sitio está en diseño.
						</p>
					</td>
				</tr>

				<tr>
					<th scope="row"><label for="azzao_posicion">Posición</label></th>
					<td>
						<select name="<?php echo esc_attr( $campo ); ?>[posicion]" id="azzao_posicion">
							<option value="derecha" <?php selected( $o['posicion'], 'derecha' ); ?>>Abajo a la derecha</option>
							<option value="izquierda" <?php selected( $o['posicion'], 'izquierda' ); ?>>Abajo a la izquierda</option>
						</select>
					</td>
				</tr>

				<tr>
					<th scope="row"><label for="azzao_saludo">Mensaje de bienvenida</label></th>
					<td>
						<textarea name="<?php echo esc_attr( $campo ); ?>[saludo]" id="azzao_saludo"
						          rows="3" class="large-text"><?php echo esc_textarea( $o['saludo'] ); ?></textarea>
						<p class="description">Déjelo vacío para usar el que trae el bot.</p>
					</td>
				</tr>

				<tr>
					<th scope="row"><label for="azzao_invitacion">Texto del globito</label></th>
					<td>
						<input name="<?php echo esc_attr( $campo ); ?>[invitacion]" id="azzao_invitacion"
						       type="text" class="regular-text"
						       value="<?php echo esc_attr( $o['invitacion'] ); ?>">
						<p class="description">
							El aviso que asoma a los 6 segundos. Vacío usa el del bot.
						</p>
					</td>
				</tr>

				<tr>
					<th scope="row"><label for="azzao_ocultar">Ocultar en</label></th>
					<td>
						<textarea name="<?php echo esc_attr( $campo ); ?>[ocultar_en]" id="azzao_ocultar"
						          rows="4" class="large-text code"
						          placeholder="/carrito/&#10;/pago/"><?php echo esc_textarea( $o['ocultar_en'] ); ?></textarea>
						<p class="description">
							Una ruta por línea, si hay páginas donde no quiere que aparezca.
						</p>
					</td>
				</tr>
			</table>

			<?php submit_button( 'Guardar cambios' ); ?>
		</form>

		<hr>
		<h2>Para abrir el chat desde un botón de la página</h2>
		<p>Use este código en cualquier botón o enlace del sitio:</p>
		<p><code>&lt;button onclick="window.AzzaoChat.abrir()"&gt;Hablar con nosotros&lt;/button&gt;</code></p>
	</div>
	<?php
}

/* -------------------------------------------------------------------------
 * 3. Atajo en la lista de plugins
 * ---------------------------------------------------------------------- */

function azzao_chat_enlace_ajustes( $enlaces ) {
	$enlace = '<a href="' . esc_url( admin_url( 'options-general.php?page=azzao-chat' ) ) . '">Ajustes</a>';
	array_unshift( $enlaces, $enlace );
	return $enlaces;
}
add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'azzao_chat_enlace_ajustes' );
