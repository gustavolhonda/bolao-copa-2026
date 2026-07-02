#!/bin/bash

echo "🚀 Iniciando o cluster Minikube..."
minikube start

echo "🔌 Habilitando o Ingress no Minikube..."
minikube addons enable ingress

echo "📦 Construindo as imagens Docker da aplicação..."
docker build -t bolao-frontend:v1 ./frontend
docker build -t bolao-backend:v1 ./backend

echo "📥 Carregando as imagens para dentro do Minikube..."
minikube image load bolao-frontend:v1
minikube image load bolao-backend:v1

#echo "Limpando webhook do Ingress para evitar bloqueio no WSL..."
#kubectl delete validatingwebhookconfigurations ingress-nginx-admission --ignore-not-found=true

echo "📦 Atualizando dependências do Helm..."
helm dependency update ./bolao-chart

# Se precisar recriar o banco do zero:
# helm uninstall bolao-app
# kubectl delete pvc bolao-app-db-pvc

echo "⚙️ Implantando a aplicação via Helm Chart..."
helm upgrade --install bolao-app ./bolao-chart

echo "⏳ Aguardando Deployments..."
kubectl rollout status deployment/backend
kubectl rollout status deployment/frontend
kubectl rollout status deployment/bolao-app-db

echo ""
echo "Pods:"
kubectl get pods

echo ""
echo "Services:"
kubectl get svc

echo ""
echo "Ingress:"
kubectl get ingress

echo "🌐 Adicione a linha abaixo no seu arquivo /etc/hosts (Linux/Mac) ou C:\Windows\System32\drivers\etc\hosts (Windows):"
echo "$(minikube ip) k8s.local"

echo "✅ Implantação concluída! Acesse http://k8s.local"
