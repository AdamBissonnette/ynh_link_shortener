## Guide d'Administration

### Configuration

L'application peut être configurée en modifiant les fichiers dans le répertoire d'installation (généralement `/var/www/<app_id>/`).

### Gestion du Service

Gérer le service avec systemd :

```bash
# Vérifier l'état du service
systemctl status <app_id>

# Redémarrer le service
systemctl restart <app_id>

# Voir les logs
journalctl -u <app_id> -f
```

### Variables d'Environnement

Les variables d'environnement peuvent être ajoutées au fichier de service systemd :
`/etc/systemd/system/<app_id>.service`

Après modification, recharger et redémarrer :
```bash
systemctl daemon-reload
systemctl restart <app_id>
```

### Sauvegarde et Restauration

L'application inclut la prise en charge automatique de la sauvegarde via YunoHost :

```bash
# Créer une sauvegarde
yunohost backup create --apps <app_id>

# Lister les sauvegardes
yunohost backup list

# Restaurer depuis une sauvegarde
yunohost backup restore <backup_name>
```

### Mise à Niveau

Mettre à niveau via YunoHost :
```bash
yunohost app upgrade <app_id>
```

Ou via l'interface d'administration web.

### Dépannage

**Le service ne démarre pas :**
- Vérifier les logs : `journalctl -u <app_id> -n 50`
- Vérifier la disponibilité du port : `netstat -tlnp | grep <port>`
- Vérifier les permissions : `ls -la /var/www/<app_id>`

**L'application n'est pas accessible :**
- Vérifier la configuration nginx : `nginx -t`
- Vérifier si l'app est en cours d'exécution : `systemctl status <app_id>`
- Tester la connexion interne : `curl http://localhost:<port>`
